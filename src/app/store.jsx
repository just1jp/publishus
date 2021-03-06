import { applyMiddleware, createStore } from "redux";

import logger from "redux-logger";
import thunk from "redux-thunk";
import promise from "redux-promise-middleware";

import reducer from "./reducers/index.jsx";

var middleware = applyMiddleware(promise(), thunk, logger());
// var middleware = applyMiddleware(promise(), thunk);

export default createStore(reducer, middleware);