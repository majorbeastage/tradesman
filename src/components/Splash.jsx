import React from "react";
import logo from "../assets/logo.png";

export default function Splash() {
  return (
    <div style={styles.container}>
      <img src={logo} alt="Tradesman Systems" style={styles.logo} />
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111"
  },
  logo: {
    width: "220px",
    border: "2px solid red" // TEMP DEBUG BORDER
  }
};
