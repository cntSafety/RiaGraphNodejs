/**
 * This file is a customized loader for the riagjs.node native module.
 * It is used to load the native module with the correct flags on Linux so that
 * extension loading works correctly.
 * @module riag_native
 * @private
 */

const process = require("process");
const constants = require("constants");
const join = require("path").join;

const riagNativeModule = { exports: {} };
const modulePath = join(__dirname, "riagjs.node");
if (process.platform === "linux") {
  process.dlopen(
    riagNativeModule,
    modulePath,
    constants.RTLD_LAZY | constants.RTLD_GLOBAL
  );
} else {
  process.dlopen(riagNativeModule, modulePath);
}

module.exports = riagNativeModule.exports;
