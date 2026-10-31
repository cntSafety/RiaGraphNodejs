import riag from "./index.js";

// Re-export everything from the CommonJS module
export const Database = riag.Database;
export const Connection = riag.Connection;
export const PreparedStatement = riag.PreparedStatement;
export const QueryResult = riag.QueryResult;
export const ArrowQueryResult = riag.ArrowQueryResult;
export const json = riag.json;
export const VERSION = riag.VERSION;
export const STORAGE_VERSION = riag.STORAGE_VERSION;
export default riag;
