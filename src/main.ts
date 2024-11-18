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

interface CacheMemento {
  cell: Cell;
  coins: Coin[];
  isDiscovered: boolean;
}

//Memento pattern for cache states as depicted on slide 21
class GameState {
  carriedCoins: Coin[] = [];
  cacheStates = new Map<string, CacheMemento>();

  getCacheKey(cell: Cell): string {
    return `${cell.i}, ${cell.j}`;
  }

  //spread operator to maintain encapsulation and protect from external modifications
  getCarriedCoins(): Coin[] {
    return [...this.carriedCoins];
  }

  getCacheCoins(cell: Cell): Coin[] {
    const memento = this.cacheStates.get(this.getCacheKey(cell));
    return memento ? [...memento.coins] : [];
  }

  saveCache(cell: Cell, coins: Coin[]) {
    const key = this.getCacheKey(cell);
    const existingInventory = this.cacheStates.get(key);

    //preserve discovered state
    const memento: CacheMemento = {
      cell,
      coins,
      isDiscovered: existingInventory ? existingInventory.isDiscovered : false,
    };

    this.cacheStates.set(key, memento);
  }

  getCache(cell: Cell): CacheMemento | undefined {
    return this.cacheStates.get(this.getCacheKey(cell));
  }

  discoverCache(cell: Cell) {
    const key = this.getCacheKey(cell);
    const memento = this.cacheStates.get(key);
    if (memento) {
      memento.isDiscovered = true;
      this.cacheStates.set(key, memento);
    }
  }

  isCacheDiscovered(cell: Cell): boolean {
    const memento = this.cacheStates.get(this.getCacheKey(cell));
    return memento ? memento.isDiscovered : false;
  }

  collectCoin(cell: Cell) {
    const key = this.getCacheKey(cell);
    const memento = this.cacheStates.get(key);
    if (memento && memento.coins.length > 0) {
      const coin = memento.coins.pop()!;
      this.carriedCoins.push(coin);
      this.cacheStates.set(key, memento);
    }
  }

  depositCoin(cell: Cell) {
    const coin = this.carriedCoins.pop();
    if (coin) {
      const key = this.getCacheKey(cell);
      const memento = this.cacheStates.get(key);
      if (memento) {
        memento.coins.push(coin);
        this.cacheStates.set(key, memento);
      } else {
        this.saveCache(cell, [coin]);
      }
    }
  }

  initializeCache(cell: Cell, coins: Coin[]) {
    const key = this.getCacheKey(cell);
    const existingMemento = this.cacheStates.get(key);

    if (!existingMemento) {
      this.saveCache(cell, coins);
    }
  }
}

//Facade Pattern
class GameFacade {
  activeCaches: Map<string, leaflet.Rectangle> = new Map();
  //gameplay parameters found in example.ts
  static CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
  static TILE_DEGREES = 1e-4;
  static NEIGHBORHOOD_SIZE = 8;
  static CACHE_PROBABILITY = 0.1;

  static MOVE_DISTANCE = 0.00004;

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
    this.initializeMovementControls();
  }

  //Will refactor later...
  moveNorth() {
    const currentPos = this.playerMarker.getLatLng();
    this.playerMarker.setLatLng([
      currentPos.lat + GameFacade.MOVE_DISTANCE,
      currentPos.lng,
    ]);
    this.updatePlayerPosition();
  }
  moveEast() {
    const currentPos = this.playerMarker.getLatLng();
    this.playerMarker.setLatLng([
      currentPos.lat,
      currentPos.lng + GameFacade.MOVE_DISTANCE,
    ]);
    this.updatePlayerPosition();
  }
  moveSouth() {
    const currentPos = this.playerMarker.getLatLng();
    this.playerMarker.setLatLng([
      currentPos.lat - GameFacade.MOVE_DISTANCE,
      currentPos.lng,
    ]);
    this.updatePlayerPosition();
  }
  moveWest() {
    const currentPos = this.playerMarker.getLatLng();
    this.playerMarker.setLatLng([
      currentPos.lat,
      currentPos.lng - GameFacade.MOVE_DISTANCE,
    ]);
    this.updatePlayerPosition();
  }

  updatePlayerPosition() {
    const newPos = this.playerMarker.getLatLng();

    //Ensures the map moves with the player
    this.map.panTo(newPos);

    //this.playerMarker.setTooltipContent(`Position:${newPos.lat.toFixed(5)}, ${newPos.lng.toFixed(5)}`);

    this.updateVisibleCaches(newPos);
  }

  updateVisibleCaches(position: leaflet.LatLng) {
    //get current position
    const nearbyCells = this.board.getCellsNearPoint(position);
    const newCacheKeys = new Set<string>();

    //loops through all cells within visibility
    nearbyCells.forEach((cell) => {
      const cacheKey = `${cell.i},${cell.j}`;
      newCacheKeys.add(cacheKey);

      //checks if cache is visible and ensures no duplication
      if (!this.activeCaches.has(cacheKey)) {
        const existingMemento = this.gameState.getCache(cell);

        if (existingMemento) {
          this.createCacheFromMemento(cell, existingMemento);
        } else if (luck(cacheKey) < GameFacade.CACHE_PROBABILITY) {
          this.createNewCache(cell);
        }
      }
    });

    //remove caches out of range
    for (const [key, cache] of this.activeCaches.entries()) {
      if (!newCacheKeys.has(key)) {
        cache.remove();
        this.activeCaches.delete(key);
      }
    }
  }

  createNewCache(cell: Cell) {
    //Generate new coins
    const coins: Coin[] = Array.from({
      length: Math.floor(luck([cell.i, cell.j, "coins"].toString()) * 5) + 1,
    }, (_, idx) => ({
      value: Math.floor(luck([cell.i, cell.j, idx].toString()) * 100),
      origin: cell,
      serial: idx,
    }));

    this.gameState.saveCache(cell, coins);

    this.createCache(cell);
  }

  createCacheFromMemento(cell: Cell, memento: CacheMemento) {
    this.createCache(cell);

    if (memento.isDiscovered) {
      this.gameState.discoverCache(cell);
    }
  }

  initializeMovementControls() {
    document.getElementById("moveNorth")?.addEventListener(
      "click",
      () => this.moveNorth(),
    );
    document.getElementById("moveEast")?.addEventListener(
      "click",
      () => this.moveEast(),
    );
    document.getElementById("moveSouth")?.addEventListener(
      "click",
      () => this.moveSouth(),
    );
    document.getElementById("moveWest")?.addEventListener(
      "click",
      () => this.moveWest(),
    );

    //Keyboard controls
    document.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
          this.moveNorth();
          break;
        case "ArrowDown":
        case "s":
          this.moveSouth();
          break;
        case "ArrowRight":
        case "d":
          this.moveEast();
          break;
        case "ArrowLeft":
        case "a":
          this.moveWest();
          break;
      }
    });
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
        this.createNewCache(cell);
      }
    });
  }

  //inspired by example.ts
  createCache(cell: Cell) {
    const bounds = this.board.getCellBounds(cell);
    const cache = leaflet.rectangle(bounds);

    //Helps the player see which caches theyve interacted with
    if (this.gameState.isCacheDiscovered(cell)) {
      cache.setStyle({ color: "#4a4" }); // discovered caches are green
    } else {
      cache.setStyle({ color: "#44f" }); // undiscovered caches are blue
    }

    cache.addTo(this.map);

    const cacheKey = `${cell.i},${cell.j}`;
    this.activeCaches.set(cacheKey, cache);

    cache.bindPopup(() => {
      //mark cache as discovered when opened
      this.gameState.discoverCache(cell);
      cache.setStyle({ color: "#4a4" });

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
