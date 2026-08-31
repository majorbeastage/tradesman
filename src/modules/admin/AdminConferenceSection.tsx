import { theme } from "../../styles/theme"
import { useAuth } from "../../contexts/AuthContext"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import ConferenceLineScheduler from "../../components/ConferenceLineScheduler"

export default function AdminConferenceSection() {
  const { session, user } = useAuth()
  const token = session?.access_token ?? ""

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <AdminSettingBlock id="admin:conference:intro">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Conference line</h1>
        <p style={{ color: theme.text, opacity: 0.8, margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          Schedule a one-time call on <strong>(863) 341-8778</strong>. Invited people dial that number, enter the PIN, and join the same conference. You can also use the standalone portal at{" "}
          <a href="/conference" style={{ color: theme.primary, fontWeight: 700 }}>
            /conference
          </a>
          . In Twilio, that number’s Voice URL must POST to <code>/api/incoming-call</code> or <code>/api/conference-join</code>.
        </p>
      </AdminSettingBlock>
      {token ? (
        <ConferenceLineScheduler
          accessToken={token}
          hostName={typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name : user?.email ?? undefined}
          hostEmail={user?.email ?? undefined}
        />
      ) : (
        <p style={{ color: theme.text }}>Sign in again to schedule a conference.</p>
      )}
    </div>
  )
}
