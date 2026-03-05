import Sidebar from "../components/Sidebar"

export default function AppLayout({ children, setPage }: any) {
  return (
    <div style={{ display: "flex", height: "100vh" }}>

      <Sidebar setPage={setPage} />

      <main style={{ flex: 1, padding: "20px" }}>
        {children}
      </main>

    </div>
  )
}
