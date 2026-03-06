import React from "react";
import "./ToolboxGrid.css";
import leads from "../assets/toolboxes/leads.png";
import communications from "../assets/toolboxes/conversations.png";
import quoties from "../assets/toolboxes/quotes.png";
import calendar from "../assets/toolboxes/calendar.png";
import techSupport from "../assets/toolboxes/tech-support.png";
import webSupport from "../assets/toolboxes/web-support.png";

const toolboxes = [
  { name: "Leads", image: leads },
  { name: "Communications", image: communications },
  { name: "Quotes", image: quoties },
  { name: "Calendar", image: calendar },
  { name: "Tech Support", image: techSupport },
  { name: "Web Support", image: webSupport },
];

export default function ToolboxGrid() {
  return (
    <div className="toolbox-grid">
      {toolboxes.map((box) => (
        <div className="toolbox-item" key={box.name}>
          <img src={box.image} alt={box.name} className="toolbox-image" />
        </div>
      ))}
    </div>
  );
}
