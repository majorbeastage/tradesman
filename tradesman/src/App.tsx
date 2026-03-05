import { useState } from "react"
import AppLayout from "./layout/AppLayout"
import CustomersPage from "./modules/customers/CustomersPage"

function App() {

  const [page, setPage] = useState("dashboard")

  return (
    <AppLayout setPage={setPage}>

      {page === "dashboard" && (
        <>
          <h1>Dashboard</h1>
          <p>Welcome to Tradesman</p>
        </>
      )}

      {page === "customers" && (
        <CustomersPage />
      )}

    </AppLayout>
  )
}

export default App
