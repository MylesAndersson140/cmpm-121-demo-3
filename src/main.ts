import "./style.css";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import leaflet from "leaflet";
import luck from "./luck.ts";

//Inspired by the flyweight cell representations found on slide 20.
interface Cell {
  readonly i: number;
  readonly j: number;
}

class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number; //neighboorhood size (def: 8)
  private readonly knownCells: Map<string, Cell>;

  constructor(tileWidth: number, tileVisibilityRadius: number) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.knownCells = new Map();
  }

  private getCanonicalCell(cell: Cell): Cell {
    const { i, j } = cell;
    const key = [i, j].toString();

    if (!this.knownCells.has(key)) {
      this.knownCells.set(key, { i, j });
    }
    return this.knownCells.get(key)!;
  }

  //converts coordinates to integer based grid cell numbers
  getCellForPoint(point: leaflet.LatLng): Cell {
    return this.getCanonicalCell({
      i: Math.floor(point.lat * 10000),
      j: Math.floor(point.lng * 10000),
    });
  }

  //converts from integer based grid cell numbers back to coordinates to determine the bounds.
  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    return leaflet.latLngBounds([
      [cell.i / 10000, cell.j / 10000],
      [(cell.i + 1) / 10000, (cell.j + 1) / 10000],
    ]);
  }

  //checks a -8 to 8 range to determine which cells to include for a cache
  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);

    for (
      let i = -this.tileVisibilityRadius;
      i <= this.tileVisibilityRadius;
      i++
    ) {
      for (
        let j = -this.tileVisibilityRadius;
        j <= this.tileVisibilityRadius;
        j++
      ) {
        resultCells.push(this.getCanonicalCell({
          i: originCell.i + i,
          j: originCell.j + j,
        }));
      }
    }

    return resultCells;
  }
}

//Allows greater coin expression
interface Coin {
  value: number;
  origin: Cell;
  serial: number;
}

//Memento pattern for cache states as depicted on slide 21
class GameState {
  carriedCoins: Coin[] = [];
  cacheContents = new Map<string, Coin[]>();

  getCacheKey(cell: Cell): string {
    return `${cell.i}, ${cell.j}`;
  }

  //spread operator to maintain encapsulation and protect from external modifications
  getCarriedCoins(): Coin[] {
    return [...this.carriedCoins];
  }

  getCacheCoins(cell: Cell): Coin[] {
    return [...(this.cacheContents.get(this.getCacheKey(cell)) || [])];
  }

  collectCoin(cell: Cell) {
    const key = this.getCacheKey(cell);
    const cache = this.cacheContents.get(key) || [];
    const coin = cache.pop();
    if (coin !== undefined) {
      this.cacheContents.set(key, cache);
      this.carriedCoins.push(coin);
    }
  }

  depositCoin(cell: Cell) {
    const coin = this.carriedCoins.pop();
    if (coin !== undefined) {
      const key = this.getCacheKey(cell);
      const cache = this.cacheContents.get(key) || [];
      cache.push(coin);
      this.cacheContents.set(key, cache);
    }
  }

  initializeCache(cell: Cell, coins: Coin[]) {
    this.cacheContents.set(this.getCacheKey(cell), coins);
  }
}

//Facade Pattern
class GameFacade {
  //gameplay parameters found in example.ts
  static CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
  static TILE_DEGREES = 1e-4;
  static NEIGHBORHOOD_SIZE = 8;
  static CACHE_PROBABILITY = 0.1;

  map: leaflet.Map;
  gameState: GameState;
  playerMarker: leaflet.Marker;
  board: Board;

  constructor() {
    this.board = new Board(
      GameFacade.TILE_DEGREES,
      GameFacade.NEIGHBORHOOD_SIZE,
    );
    this.gameState = new GameState();
    this.map = this.initializeMap();
    this.playerMarker = this.initializePlayer();
    this.initializeCaches();
  }

  //current starting location inspired by example.ts
  initializePlayer(): leaflet.Marker {
    const marker = leaflet.marker(GameFacade.CLASSROOM);
    marker.bindTooltip("Starting Location!");
    marker.addTo(this.map);
    return marker;
  }

  initializeMap(): leaflet.Map {
    const map = leaflet.map("map", {
      center: GameFacade.CLASSROOM,
      zoom: 19,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    //inspired by example.ts
    leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    return map;
  }

  initializeCaches() {
    const nearbyCells = this.board.getCellsNearPoint(GameFacade.CLASSROOM);

    nearbyCells.forEach((cell) => {
      const luckyString = `${cell.i},${cell.j}`;
      if (luck(luckyString) < GameFacade.CACHE_PROBABILITY) {
        this.createCache(cell);
      }
    });
  }

  //inspired by example.ts
  createCache(cell: Cell) {
    const bounds = this.board.getCellBounds(cell);
    const cache = leaflet.rectangle(bounds);
    cache.addTo(this.map);

    //inspired from example.ts
    //generates coin values and determines the coordinate location (i,j), and serial number
    const coins: Coin[] = Array.from({
      length: Math.floor(luck([cell.i, cell.j, "coins"].toString()) * 5) + 1,
    }, (_, idx) => ({
      value: Math.floor(luck([cell.i, cell.j, idx].toString()) * 100),
      origin: cell,
      serial: idx,
    }));

    this.gameState.initializeCache(cell, coins);

    cache.bindPopup(() => {
      const div = document.createElement("div");

      //compact coin representation
      const compactRep = (coin: Coin) =>
        `${coin.value}(${coin.origin.i}:${coin.origin.j}#${coin.serial})`;

      //allows for the explicit showing of coin representation on user end
      div.innerHTML = `
        <div>Cache contents: ${
        this.gameState.getCacheCoins(cell)
          .map(compactRep)
          .join(", ")
      }</div>
      </div>
        <div>Carrying: ${
        this.gameState.getCarriedCoins()
          .map(compactRep)
          .join(", ")
      }</div>
        <button id="collect">Collect</button>
        <button id="deposit">Deposit</button>
        `;

      //Event listeners inspired by example.ts
      div.querySelector("#collect")?.addEventListener("click", () => {
        this.gameState.collectCoin(cell);
        cache.closePopup();
      });

      div.querySelector("#deposit")?.addEventListener("click", () => {
        this.gameState.depositCoin(cell);
        cache.closePopup();
      });

      return div;
    });
  }
}

//Initializing game
document.addEventListener("DOMContentLoaded", () => {
  new GameFacade();
});
