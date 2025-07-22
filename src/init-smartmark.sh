#!/bin/bash

# Create folders
mkdir -p src/components
mkdir -p src/pages
mkdir -p src/assets
mkdir -p src/styles

# App.js
cat > src/App.js <<'EOF'
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Landing from "./pages/Landing";
import CampaignForm from "./pages/CampaignForm";
import Confirmation from "./pages/Confirmation";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/campaign" element={<CampaignForm />} />
          <Route path="/confirmation" element={<Confirmation />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
EOF

# Navbar.js
cat > src/components/Navbar.js <<'EOF'
import React from "react";
import logo from "../assets/logo.png"; // Use a placeholder if needed

const Navbar = () => (
  <nav className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
    <div className="flex items-center space-x-2">
      <img src={logo} alt="SmartMark Logo" className="h-8 w-8 rounded-full" />
      <span className="font-bold text-xl text-gray-900">SmartMark</span>
    </div>
    <a
      href="/campaign"
      className="px-4 py-2 rounded-xl bg-black text-white hover:bg-gray-800 transition"
    >
      Start Campaign
    </a>
  </nav>
);

export default Navbar;
EOF

# EditableBox.js
cat > src/components/EditableBox.js <<'EOF'
import React, { useState } from "react";
import { Rnd } from "react-rnd";
import { Link } from "react-router-dom";

const EditableBox = ({
  defaultText,
  type = "text",
  defaultWidth = 300,
  defaultHeight = 50,
  isButton = false,
  to = "",
  className = "",
}) => {
  const [text, setText] = useState(defaultText);
  const [editing, setEditing] = useState(false);

  return (
    <Rnd
      default={{
        x: 0,
        y: 0,
        width: defaultWidth,
        height: defaultHeight,
      }}
      bounds="parent"
      enableResizing={true}
      className="bg-white shadow-lg rounded-2xl border border-gray-200 cursor-move"
    >
      {editing ? (
        <textarea
          className={`w-full h-full p-2 outline-none resize-none ${className}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
        />
      ) : isButton ? (
        <Link
          to={to}
          className={`block w-full h-full flex items-center justify-center text-lg font-semibold rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow ${className}`}
          onClick={() => setEditing(false)}
        >
          {text}
        </Link>
      ) : (
        <div
          className={`w-full h-full p-2 ${className}`}
          onDoubleClick={() => setEditing(true)}
        >
          {text}
        </div>
      )}
    </Rnd>
  );
};

export default EditableBox;
EOF

# Landing.js
cat > src/pages/Landing.js <<'EOF'
import React from "react";
import EditableBox from "../components/EditableBox";

const Landing = () => {
  return (
    <div className="flex flex-col items-center justify-center pt-10">
      <EditableBox
        defaultText="Welcome to SmartMark"
        type="headline"
        defaultWidth={420}
        defaultHeight={60}
        className="text-4xl font-bold"
      />
      <EditableBox
        defaultText="Run Facebook Ads in minutes—No agency, no hassle."
        type="subtitle"
        defaultWidth={420}
        defaultHeight={40}
        className="text-xl mt-6 text-gray-600"
      />
      <EditableBox
        defaultText="Start Campaign"
        type="button"
        isButton
        to="/campaign"
        className="mt-12"
      />
    </div>
  );
};

export default Landing;
EOF

# CampaignForm.js
cat > src/pages/CampaignForm.js <<'EOF'
import React from "react";

const CampaignForm = () => {
  return (
    <div className="flex flex-col items-center justify-center pt-10">
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Create a Campaign</h2>
        <form className="space-y-4">
          <input className="w-full border rounded p-3" placeholder="Your Email" />
          <input className="w-full border rounded p-3" placeholder="CashTag" />
          <input className="w-full border rounded p-3" placeholder="Budget (USD)" type="number" />
          <input className="w-full border rounded p-3" placeholder="Business Website URL" />
          <input className="w-full border rounded p-3" placeholder="Promotion (optional)" />
          <button
            type="submit"
            className="w-full mt-6 py-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold"
          >
            Launch Campaign
          </button>
        </form>
      </div>
    </div>
  );
};

export default CampaignForm;
EOF

# Confirmation.js
cat > src/pages/Confirmation.js <<'EOF'
import React from "react";
import { Link } from "react-router-dom";

const Confirmation = () => (
  <div className="flex flex-col items-center justify-center pt-20">
    <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
      <h2 className="text-2xl font-bold mb-4">🎉 Your campaign is live!</h2>
      <p className="text-gray-700 mb-6">
        Thank you for launching your campaign. We’ll update you on performance soon.
      </p>
      <Link
        to="/"
        className="px-6 py-2 rounded-xl bg-black text-white hover:bg-gray-800 transition"
      >
        Back to Home
      </Link>
    </div>
  </div>
);

export default Confirmation;
EOF

# index.css (optional, add if you want to override some Tailwind defaults)
cat > src/index.css <<'EOF'
/* Add custom styles here or leave blank if using Tailwind CDN only */
body {
  font-family: 'Inter', system-ui, sans-serif;
}
EOF

# index.js (React entry)
cat > src/index.js <<'EOF'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { BrowserRouter } from "react-router-dom";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
EOF

# logo placeholder
echo "" > src/assets/logo.png

echo "✅ All files and folders created. Install dependencies:"
echo "   npm install react-router-dom react-rnd"
echo ""
echo "🔵 Add the Tailwind CDN link to public/index.html for now:"
echo '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">'
echo ""
echo "Start your dev server with: npm start"
