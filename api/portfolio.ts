import { productionHandlers } from "../server/handlers.js";

export function GET(request: Request) {
  return productionHandlers().getPortfolio(request);
}

export function PUT(request: Request) {
  return productionHandlers().putPortfolio(request);
}
