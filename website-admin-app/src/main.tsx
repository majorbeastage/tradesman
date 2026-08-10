import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { initSharedAuth } from "./lib/sharedAuth"

void initSharedAuth().then((cleanup) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return cleanup
})
