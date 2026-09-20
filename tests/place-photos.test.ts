import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPhotoMeta,
  firstPhotoRef,
  parsePhotoAttributions,
} from "../src/server/providers/placePhotos";
import type { Spot } from "../src/domain/schemas";

describe("place photos", () => {
  it("keeps attributions from the first photo of that place", () => {
    const photos = [
      {
        name: "places/ChIJ_abc/photos/AAA",
        authorAttributions: [
          { displayName: "山田", uri: "https://maps.google.com/maps/contrib/1" },
          { displayName: "  ", uri: undefined },
        ],
      },
      {
        name: "places/ChIJ_other/photos/BBB",
        authorAttributions: [{ displayName: "別人", uri: null }],
      },
    ];
    assert.deepEqual(firstPhotoRef(photos), {
      name: "places/ChIJ_abc/photos/AAA",
      attributions: [{ displayName: "山田", uri: "https://maps.google.com/maps/contrib/1" }],
    });
    assert.deepEqual(parsePhotoAttributions(photos), [
      { displayName: "山田", uri: "https://maps.google.com/maps/contrib/1" },
    ]);
  });

  it("attaches photo meta to a spot without inventing a URL", () => {
    const spot: Spot = {
      id: "ChIJ_abc",
      name: "カフェ",
      lat: 35.17,
      lng: 136.88,
      categories: ["cafe"],
      environment: { value: "INDOOR", evidenceIds: [] },
      costForTwoJpy: { value: null, evidenceIds: [] },
      restEase: { value: "EASY", evidenceIds: [] },
      standingBurden: { value: "LOW", evidenceIds: [] },
      officialUrl: null,
    };
    const next = applyPhotoMeta(
      spot,
      { name: "places/ChIJ_abc/photos/AAA", attributions: [{ displayName: "山田", uri: null }] },
      "https://maps.google.com/?cid=1",
    );
    assert.equal(next.photoName, "places/ChIJ_abc/photos/AAA");
    assert.equal(next.imageUrl, undefined);
    assert.equal(next.imageProvider, "places");
    assert.equal(next.imageAttributions?.[0]?.displayName, "山田");
  });
});
