import "./style.css";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import leaflet from "leaflet";
import luck from "./luck.ts";

//Memento pattern for cache states as depicted on slide 21
class GameState {
  carriedCoins: number[] = [];
  cacheContents = new Map<string, number[]>();

  getCarriedCoins(): number[] {
    return [...this.carriedCoins];
  }
  getCacheCoins(cacheId: string): number[] {
    return [...(this.cacheContents.get(cacheId) || [])];
  }

  collectCoin(cacheId: string) {
    const cache = this.cacheContents.get(cacheId) || [];
    const coin = cache.pop();
    if (coin !== undefined) {
      this.cacheContents.set(cacheId, cache);
      this.carriedCoins.push(coin);
    }
  }

  depositCoin(cacheId: string) {
    const coin = this.carriedCoins.pop();
    if (coin !== undefined) {
      const cache = this.cacheContents.get(cacheId) || [];
      cache.push(coin);
      this.cacheContents.set(cacheId, cache);
    }
  }

  initializeCache(cacheId: string, coins: number[]) {
    this.cacheContents.set(cacheId, coins);
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

  constructor() {
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
    //creating a range from -8 to 8 around the player
    const classroomArea = Array.from(
      { length: GameFacade.NEIGHBORHOOD_SIZE * 2 + 1 },
      (_, i) => i - GameFacade.NEIGHBORHOOD_SIZE,
    );

    //based on luck value place a cache at the given location
    classroomArea.forEach((x) => {
      classroomArea.forEach((y) => {
        //fed into the luck function for potential cache locations
        const luckString = `${x}, ${y}`;
        if (luck(luckString) < GameFacade.CACHE_PROBABILITY) {
          this.createCache(x, y);
        }
      });
    });
  }

  //inspired by example.ts
  createCache(i: number, j: number) {
    const bounds = leaflet.latLngBounds([
      [
        GameFacade.CLASSROOM.lat + i * GameFacade.TILE_DEGREES,
        GameFacade.CLASSROOM.lng + j * GameFacade.TILE_DEGREES,
      ],
      [
        GameFacade.CLASSROOM.lat + (i + 1) * GameFacade.TILE_DEGREES,
        GameFacade.CLASSROOM.lng + (j + 1) * GameFacade.TILE_DEGREES,
      ],
    ]);

    const cache = leaflet.rectangle(bounds);
    cache.addTo(this.map);

    const cacheId = `${i},${j}`;
    //inspired from example.ts
    //generates coin values and determines the coordinate location (i,j)
    const coins = Array.from({
      length: Math.floor(luck([i, j, "coins"].toString()) * 5) + 1,
    }, (_, idx) => Math.floor(luck([i, j, idx].toString()) * 100));

    this.gameState.initializeCache(cacheId, coins);

    cache.bindPopup(() => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div>Cache contents: ${
        this.gameState.getCacheCoins(cacheId).join(", ")
      }</div>
        <div>Carrying: ${this.gameState.getCarriedCoins().join(", ")}</div>
        <button id="collect">Collect</button>
        <button id="deposit">Deposit</button>
        `;

      //Event listeners inspired by example.ts
      div.querySelector("#collect")?.addEventListener("click", () => {
        this.gameState.collectCoin(cacheId);
        cache.closePopup();
      });

      div.querySelector("#deposit")?.addEventListener("click", () => {
        this.gameState.depositCoin(cacheId);
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
