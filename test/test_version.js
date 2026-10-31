const { assert } = require("chai");

describe("Get version", function () {
  it("should get the version of the library", function () {
    assert.isString(riag.VERSION);
    assert.notEqual(riag.VERSION, "");
  });

  it("should get the storage version of the library", function () {
    assert.isNumber(riag.STORAGE_VERSION);
    assert.isAtLeast(riag.STORAGE_VERSION, 1);
  });
});
