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
