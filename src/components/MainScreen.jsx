import React from "react";
import leads from "../assets/toolboxes/leads.png";
import communications from "../assets/toolboxes/conversations.png";
import quoties from "../assets/toolboxes/quotes.png";
import calendar from "../assets/toolboxes/calendar.png";
import techSupport from "../assets/toolboxes/tech-support.png";
import webSupport from "../assets/toolboxes/web-support.png";

export default function MainScreen() {
  const tools = [
    { name: "Leads", icon: leads },
    { name: "Communications", icon: communications },
    { name: "Quoties", icon: quoties },
    { name: "Calendar", icon: calendar },
    { name: "Tech Support", icon: techSupport },
    { name: "Web Support", icon: webSupport }
  ];

  return (
    <div style={styles.container}>
      <div className="grid">
        {tools.map((tool, index) => (
          <div
            key={index}
            className="card"
            onClick={() => console.log(tool.name)}
          >
            <img src={tool.icon} alt={tool.name} className="icon" />
            <p>{tool.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "20px",
    backgroundColor: "#111",
    minHeight: "100vh"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px"
  },
  card: {
    backgroundColor: "#1c1c1c",
    padding: "20px",
    borderRadius: "16px",
    textAlign: "center",
    color: "#fff"
  },
  icon: {
    width: "60px",
    marginBottom: "10px"
  }
};
