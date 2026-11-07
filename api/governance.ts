import { productionHandlers } from "../server/handlers.js";

export function GET(request: Request) {
  return productionHandlers().getGovernance(request);
}
export function POST(request: Request) {
  return productionHandlers().postGovernance(request);
}
