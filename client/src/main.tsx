import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installRegionAwareFetch } from "./lib/queryClient";

installRegionAwareFetch();

createRoot(document.getElementById("root")!).render(<App />);
