import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { isVenuePlaceId, placePhotosResponseSchema } from "../src/contracts/places";
import {
  listVenuePhotos,
  loadVenuePhotoMedia,
  resetPlacePhotoFailures,
} from "../src/server/providers/placePhotos";

const PLACE_A = "ChIJAAAAAAAAAAAAAAAAAAAA";
const PLACE_B = "ChIJBBBBBBBBBBBBBBBBBBBB";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("place photo contract", () => {
  it("keeps ready / none / failed distinct and does not mark displayVerified", () => {
    const parsed = placePhotosResponseSchema.parse({
      photos: [
        {
          placeId: PLACE_A,
          state: "ready",
          kind: "VENUE",
          source: "places",
          imageUrl: `/api/places/photos/media?placeId=${PLACE_A}`,
          googleMapsUri: "https://maps.google.com/?cid=1",
          authorAttributions: [{ displayName: "Ada", uri: "https://maps.google.com/maps/contrib/1", photoUri: null }],
        },
        {
          placeId: PLACE_B,
          state: "none",
          kind: "VENUE",
          source: "places",
          imageUrl: null,
          googleMapsUri: null,
          authorAttributions: [],
        },
      ],
    });
    assert.equal(parsed.photos[0]?.state, "ready");
    assert.equal(parsed.photos[1]?.state, "none");
    assert.equal("displayVerified" in parsed.photos[0]!, false);
    assert.equal(isVenuePlaceId("mock:cafe-kitte"), false);
    assert.equal(isVenuePlaceId(PLACE_A), true);
  });
});

describe("listVenuePhotos", () => {
  beforeEach(() => resetPlacePhotoFailures());

  it("loads photos by Place ID and never searches by shop name", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      assert.equal(url.includes("searchText"), false);
      assert.equal(url.includes("searchNearby"), false);
      if (url.includes(`/places/${PLACE_A}`)) {
        return jsonResponse({
          id: PLACE_A,
          googleMapsUri: "https://maps.google.com/?cid=a",
          photos: [
            {
              name: `places/${PLACE_A}/photos/photoA`,
              googleMapsUri: "https://maps.google.com/?cid=photo-a",
              authorAttributions: [{ displayName: "Ada", uri: "//maps.google.com/maps/contrib/1" }],
            },
          ],
        });
      }
      if (url.includes(`/places/${PLACE_B}`)) {
        return jsonResponse({ id: PLACE_B, photos: [] });
      }
      return jsonResponse({}, 500);
    };

    const photos = await listVenuePhotos({
      apiKey: "test-key",
      placeIds: [PLACE_A, PLACE_B, "mock:cafe-kitte"],
      fetchImpl,
    });
    assert.deepEqual(
      photos.map((row) => [row.placeId, row.state]),
      [
        [PLACE_A, "ready"],
        [PLACE_B, "none"],
        ["mock:cafe-kitte", "none"],
      ],
    );
    assert.equal(photos[0]?.imageUrl, `/api/places/photos/media?placeId=${encodeURIComponent(PLACE_A)}`);
    assert.equal(photos[0]?.authorAttributions[0]?.displayName, "Ada");
    assert.equal(photos[0]?.authorAttributions[0]?.uri, "https://maps.google.com/maps/contrib/1");
    assert.equal(photos[0]?.kind, "VENUE");
    assert.equal(urls.some((url) => url.includes("searchText")), false);
  });

  it("marks failed after details errors and then stops retrying", async () => {
    let detailsCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      detailsCalls += 1;
      return jsonResponse({}, 500);
    };
    const first = await listVenuePhotos({ apiKey: "test-key", placeIds: [PLACE_A], fetchImpl });
    const second = await listVenuePhotos({ apiKey: "test-key", placeIds: [PLACE_A], fetchImpl });
    const third = await listVenuePhotos({ apiKey: "test-key", placeIds: [PLACE_A], fetchImpl });
    assert.equal(first[0]?.state, "failed");
    assert.equal(second[0]?.state, "failed");
    assert.equal(third[0]?.state, "failed");
    assert.equal(detailsCalls, 2);
  });
});

describe("loadVenuePhotoMedia", () => {
  beforeEach(() => resetPlacePhotoFailures());

  it("refetches Place Details when the photo name expires, once", async () => {
    let detailsCalls = 0;
    let mediaCalls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/media")) {
        mediaCalls += 1;
        if (mediaCalls === 1) return new Response("expired", { status: 400 });
        return new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
      }
      detailsCalls += 1;
      return jsonResponse({
        id: PLACE_A,
        photos: [{ name: `places/${PLACE_A}/photos/photo${detailsCalls}` }],
      });
    };
    const result = await loadVenuePhotoMedia({ apiKey: "test-key", placeId: PLACE_A, fetchImpl });
    assert.equal(result.state, "ready");
    if (result.state === "ready") {
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.bytes.length, 3);
    }
    assert.equal(detailsCalls, 2);
    assert.equal(mediaCalls, 2);
  });
});
