import assert from "node:assert/strict";
import { deckFor } from "../web/content/swap_deck_rules.js";
import { sexPoseFor } from "../web/content/swap_tease_rules.js";
assert.notDeepEqual(deckFor("hotel_room").map((c) => c.id), deckFor("hotel_bath").map((c) => c.id));
assert.equal(sexPoseFor("hotel_room"), "missionary");
assert.equal(sexPoseFor("hotel_bath"), "doggy");
console.log("swap_hotel_switch ok");
