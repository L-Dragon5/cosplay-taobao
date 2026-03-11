import { createRoot } from "react-dom/client"
import { App } from "@/frontend/App"

const rootElement = document.getElementById("root")!
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement)
  root.render(<App />)
}
