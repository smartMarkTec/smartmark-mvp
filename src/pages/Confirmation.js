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
