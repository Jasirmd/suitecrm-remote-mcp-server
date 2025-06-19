import { McpAgent } from "@modelcontextprotocol/sdk";
import { McpServer } from "@modelcontextprotocol/sdk";
import { z } from "zod";

// SuiteCRM Configuration
const SUITECRM_CONFIG = {
  url: 'https://0173-2409-40f2-11ac-6afb-fcc8-9c4a-f5b6-6a05.ngrok-free.app/SuiteCRM-7.14.6/service/v4_1/rest.php',
  username: 'admin',
  password: 'Admin@123'
};

// --- Minimal MD5 implementation for password hashing (replace for production) ---
async function md5(str: string): Promise<string> {
  // Cloudflare Workers do not support Node.js crypto, so use a WASM or JS MD5 implementation in production.
  // For now, SuiteCRM allows plain text for local dev, but this is NOT secure.
  return str;
}

// --- SuiteCRM API Helper ---
class SuiteCRMAPI {
  private sessionId: string | null = null;

  async login() {
    const loginParams = {
      user_auth: {
        user_name: SUITECRM_CONFIG.username,
        password: await md5(SUITECRM_CONFIG.password),
        version: "1"
      },
      application_name: "RestTest",
      name_value_list: []
    };
    const result = await this.call("login", loginParams);
    if (result.id) {
      this.sessionId = result.id;
      return result.id;
    }
    throw new Error("Login failed");
  }

  async call(method: string, parameters: any) {
    const postData = {
      method,
      input_type: "JSON",
      response_type: "JSON",
      rest_data: JSON.stringify(parameters)
    };
    const response = await fetch(SUITECRM_CONFIG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(postData).toString()
    });
    if (!response.ok) throw new Error(`API call failed: ${response.statusText}`);
    return response.json();
  }

  async ensureLoggedIn() {
    if (!this.sessionId) await this.login();
    return this.sessionId;
  }
}

// --- Main Worker Handler ---
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const api = new SuiteCRMAPI();

    // --- CONTACTS ---
    if (url.pathname === "/contacts/search" && request.method === "POST") {
      const { query, field = "phone_mobile" } = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Contacts",
        query: `contacts.${field} LIKE '%${query}%'`,
        select_fields: ["id", "first_name", "last_name", "email1", "phone_mobile"],
        max_results: 10
      };
      const result = await api.call("get_entry_list", params);
      return json(result);
    }

    if (url.pathname === "/contacts/create" && request.method === "POST") {
      const contact_data = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Contacts",
        name_value_list: Object.entries(contact_data).map(([name, value]) => ({ name, value }))
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    // --- LEADS ---
    if (url.pathname === "/leads/search" && request.method === "POST") {
      const { query, field = "phone_mobile", status } = await request.json();
      await api.ensureLoggedIn();
      let queryString = `leads.${field} LIKE '%${query}%'`;
      if (status) queryString += ` AND leads.status = '${status}'`;
      const params = {
        session: api.sessionId,
        module_name: "Leads",
        query: queryString,
        select_fields: [
          "id", "first_name", "last_name", "email1", "phone_mobile",
          "status", "lead_source", "description"
        ],
        max_results: 10
      };
      const result = await api.call("get_entry_list", params);
      return json(result);
    }

    if (url.pathname === "/leads/create" && request.method === "POST") {
      const lead_data = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Leads",
        name_value_list: Object.entries(lead_data).map(([name, value]) => ({ name, value }))
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    if (url.pathname === "/leads/update" && request.method === "POST") {
      const { lead_id, lead_data } = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Leads",
        name_value_list: [
          { name: "id", value: lead_id },
          ...Object.entries(lead_data).map(([name, value]) => ({ name, value }))
        ]
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    // --- ACCOUNTS ---
    if (url.pathname === "/accounts/search" && request.method === "POST") {
      const { query, field = "name", account_type } = await request.json();
      await api.ensureLoggedIn();
      let queryString = `accounts.${field} LIKE '%${query}%'`;
      if (account_type) queryString += ` AND accounts.account_type = '${account_type}'`;
      const params = {
        session: api.sessionId,
        module_name: "Accounts",
        query: queryString,
        select_fields: [
          "id", "name", "account_type", "industry", "annual_revenue",
          "phone_office", "email1", "billing_address_street",
          "billing_address_city", "billing_address_state", "billing_address_country"
        ],
        max_results: 10
      };
      const result = await api.call("get_entry_list", params);
      return json(result);
    }

    if (url.pathname === "/accounts/create" && request.method === "POST") {
      const account_data = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Accounts",
        name_value_list: Object.entries(account_data).map(([name, value]) => ({ name, value }))
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    if (url.pathname === "/accounts/update" && request.method === "POST") {
      const { account_id, account_data } = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Accounts",
        name_value_list: [
          { name: "id", value: account_id },
          ...Object.entries(account_data).map(([name, value]) => ({ name, value }))
        ]
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    // --- OPPORTUNITIES ---
    if (url.pathname === "/opportunities/search" && request.method === "POST") {
      const { query, field = "name", sales_stage } = await request.json();
      await api.ensureLoggedIn();
      let queryString = `opportunities.${field} LIKE '%${query}%'`;
      if (sales_stage) queryString += ` AND opportunities.sales_stage = '${sales_stage}'`;
      const params = {
        session: api.sessionId,
        module_name: "Opportunities",
        query: queryString,
        select_fields: [
          "id", "name", "amount", "sales_stage", "probability",
          "date_closed", "next_step", "lead_source", "description"
        ],
        max_results: 10
      };
      const result = await api.call("get_entry_list", params);
      return json(result);
    }

    if (url.pathname === "/opportunities/create" && request.method === "POST") {
      const opportunity_data = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Opportunities",
        name_value_list: Object.entries(opportunity_data).map(([name, value]) => ({ name, value }))
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    if (url.pathname === "/opportunities/update" && request.method === "POST") {
      const { opportunity_id, opportunity_data } = await request.json();
      await api.ensureLoggedIn();
      const params = {
        session: api.sessionId,
        module_name: "Opportunities",
        name_value_list: [
          { name: "id", value: opportunity_id },
          ...Object.entries(opportunity_data).map(([name, value]) => ({ name, value }))
        ]
      };
      const result = await api.call("set_entry", params);
      return json(result);
    }

    // --- Not Found ---
    return new Response("Not found", { status: 404 });
  }
};

// --- Helper: JSON Response ---
function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" }
  });
}
