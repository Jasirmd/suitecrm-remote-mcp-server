import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// SuiteCRM Configuration
const SUITECRM_CONFIG = {
  url: process.env.SUITECRM_URL || 'https://0173-2409-40f2-11ac-6afb-fcc8-9c4a-f5b6-6a05.ngrok-free.app/SuiteCRM-7.14.6/service/v4_1/rest.php',
  username: process.env.SUITECRM_USERNAME || 'admin',
  password: process.env.SUITECRM_PASSWORD || 'Admin@123'
};

// SuiteCRM API Class
class SuiteCRMAPI {
  private sessionId: string | null = null;

  async login() {
    const loginParams = {
      user_auth: {
        user_name: SUITECRM_CONFIG.username,
        password: this.hashPassword(SUITECRM_CONFIG.password),
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

  private hashPassword(password: string): string {
    // Note: Using a simple MD5 hash for compatibility with SuiteCRM
    // In production, you should use a more secure method
    return require('crypto').createHash('md5').update(password).digest('hex');
  }

  async call(method: string, parameters: any) {
    const postData = {
      method: method,
      input_type: "JSON",
      response_type: "JSON",
      rest_data: JSON.stringify(parameters)
    };

    const response = await fetch(SUITECRM_CONFIG.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'ngrok-skip-browser-warning': 'true'
      },
      body: new URLSearchParams(postData).toString()
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    return response.json();
  }

  async ensureLoggedIn() {
    if (!this.sessionId) {
      await this.login();
    }
    return this.sessionId;
  }
}

// Define our MCP agent with SuiteCRM tools
export class SuiteCRMMCP extends McpAgent {
  private api: SuiteCRMAPI;
  server = new McpServer({
    name: "SuiteCRM API",
    version: "1.0.0",
  });

  constructor() {
    super();
    this.api = new SuiteCRMAPI();
  }

  async init() {
    // Contact Search Tool
    this.server.tool(
      "search_contacts",
      {
        query: z.string(),
        field: z.string().optional().default("phone_mobile")
      },
      async ({ query, field }) => {
        await this.api.ensureLoggedIn();
        const searchParams = {
          session: this.api.sessionId,
          module_name: "Contacts",
          query: `contacts.${field} LIKE '%${query}%'`,
          select_fields: ["id", "first_name", "last_name", "email1", "phone_mobile"],
          max_results: 10
        };
        const result = await this.api.call("get_entry_list", searchParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Create Contact Tool
    this.server.tool(
      "create_contact",
      {
        contact_data: z.object({
          first_name: z.string(),
          last_name: z.string(),
          email: z.string().optional(),
          phone_mobile: z.string().optional()
        })
      },
      async ({ contact_data }) => {
        await this.api.ensureLoggedIn();
        const createParams = {
          session: this.api.sessionId,
          module_name: "Contacts",
          name_value_list: Object.entries(contact_data).map(([key, value]) => ({
            name: key,
            value: value
          }))
        };
        const result = await this.api.call("set_entry", createParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Search Leads Tool
    this.server.tool(
      "search_leads",
      {
        query: z.string(),
        field: z.string().optional().default("phone_mobile"),
        status: z.string().optional()
      },
      async ({ query, field, status }) => {
        await this.api.ensureLoggedIn();
        let queryString = `leads.${field} LIKE '%${query}%'`;
        if (status) {
          queryString += ` AND leads.status = '${status}'`;
        }
        
        const searchParams = {
          session: this.api.sessionId,
          module_name: "Leads",
          query: queryString,
          select_fields: [
            "id", 
            "first_name", 
            "last_name", 
            "email1", 
            "phone_mobile",
            "status",
            "lead_source",
            "description"
          ],
          max_results: 10
        };
        
        const result = await this.api.call("get_entry_list", searchParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Create Lead Tool
    this.server.tool(
      "create_lead",
      {
        lead_data: z.object({
          first_name: z.string(),
          last_name: z.string(),
          email1: z.string().optional(),
          phone_mobile: z.string().optional(),
          status: z.string().optional().default("New"),
          lead_source: z.string().optional(),
          description: z.string().optional()
        })
      },
      async ({ lead_data }) => {
        await this.api.ensureLoggedIn();
        const createParams = {
          session: this.api.sessionId,
          module_name: "Leads",
          name_value_list: Object.entries(lead_data).map(([key, value]) => ({
            name: key,
            value: value
          }))
        };
        
        const result = await this.api.call("set_entry", createParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Update Lead Tool
    this.server.tool(
      "update_lead",
      {
        lead_id: z.string(),
        lead_data: z.object({
          first_name: z.string().optional(),
          last_name: z.string().optional(),
          email1: z.string().optional(),
          phone_mobile: z.string().optional(),
          status: z.string().optional(),
          lead_source: z.string().optional(),
          description: z.string().optional()
        })
      },
      async ({ lead_id, lead_data }) => {
        await this.api.ensureLoggedIn();
        const updateParams = {
          session: this.api.sessionId,
          module_name: "Leads",
          name_value_list: [
            { name: "id", value: lead_id },
            ...Object.entries(lead_data).map(([key, value]) => ({
              name: key,
              value: value
            }))
          ]
        };
        
        const result = await this.api.call("set_entry", updateParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Convert Lead Tool
    this.server.tool(
      "convert_lead",
      {
        lead_id: z.string()
      },
      async ({ lead_id }) => {
        await this.api.ensureLoggedIn();
        const convertParams = {
          session: this.api.sessionId,
          module_name: "Leads",
          module_id: lead_id
        };
        
        const result = await this.api.call("convert_lead", convertParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Search Accounts Tool
    this.server.tool(
      "search_accounts",
      {
        query: z.string(),
        field: z.string().optional().default("name"),
        account_type: z.string().optional()
      },
      async ({ query, field, account_type }) => {
        await this.api.ensureLoggedIn();
        let queryString = `accounts.${field} LIKE '%${query}%'`;
        if (account_type) {
          queryString += ` AND accounts.account_type = '${account_type}'`;
        }
        
        const searchParams = {
          session: this.api.sessionId,
          module_name: "Accounts",
          query: queryString,
          select_fields: [
            "id",
            "name",
            "account_type",
            "industry",
            "annual_revenue",
            "phone_office",
            "email1",
            "billing_address_street",
            "billing_address_city",
            "billing_address_state",
            "billing_address_country"
          ],
          max_results: 10
        };
        
        const result = await this.api.call("get_entry_list", searchParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Create Account Tool
    this.server.tool(
      "create_account",
      {
        account_data: z.object({
          name: z.string(),
          account_type: z.string().optional(),
          industry: z.string().optional(),
          annual_revenue: z.string().optional(),
          phone_office: z.string().optional(),
          email1: z.string().optional(),
          billing_address_street: z.string().optional(),
          billing_address_city: z.string().optional(),
          billing_address_state: z.string().optional(),
          billing_address_country: z.string().optional()
        })
      },
      async ({ account_data }) => {
        await this.api.ensureLoggedIn();
        const createParams = {
          session: this.api.sessionId,
          module_name: "Accounts",
          name_value_list: Object.entries(account_data).map(([key, value]) => ({
            name: key,
            value: value
          }))
        };
        
        const result = await this.api.call("set_entry", createParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Update Account Tool
    this.server.tool(
      "update_account",
      {
        account_id: z.string(),
        account_data: z.object({
          name: z.string().optional(),
          account_type: z.string().optional(),
          industry: z.string().optional(),
          annual_revenue: z.string().optional(),
          phone_office: z.string().optional(),
          email1: z.string().optional(),
          billing_address_street: z.string().optional(),
          billing_address_city: z.string().optional(),
          billing_address_state: z.string().optional(),
          billing_address_country: z.string().optional()
        })
      },
      async ({ account_id, account_data }) => {
        await this.api.ensureLoggedIn();
        const updateParams = {
          session: this.api.sessionId,
          module_name: "Accounts",
          name_value_list: [
            { name: "id", value: account_id },
            ...Object.entries(account_data).map(([key, value]) => ({
              name: key,
              value: value
            }))
          ]
        };
        
        const result = await this.api.call("set_entry", updateParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Search Opportunities Tool
    this.server.tool(
      "search_opportunities",
      {
        query: z.string(),
        field: z.string().optional().default("name"),
        sales_stage: z.string().optional()
      },
      async ({ query, field, sales_stage }) => {
        await this.api.ensureLoggedIn();
        let queryString = `opportunities.${field} LIKE '%${query}%'`;
        if (sales_stage) {
          queryString += ` AND opportunities.sales_stage = '${sales_stage}'`;
        }
        
        const searchParams = {
          session: this.api.sessionId,
          module_name: "Opportunities",
          query: queryString,
          select_fields: [
            "id",
            "name",
            "amount",
            "sales_stage",
            "probability",
            "date_closed",
            "next_step",
            "lead_source",
            "description"
          ],
          max_results: 10
        };
        
        const result = await this.api.call("get_entry_list", searchParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Create Opportunity Tool
    this.server.tool(
      "create_opportunity",
      {
        opportunity_data: z.object({
          name: z.string(),
          amount: z.string().optional(),
          sales_stage: z.string().optional().default("Prospecting"),
          probability: z.string().optional(),
          date_closed: z.string().optional(),
          next_step: z.string().optional(),
          lead_source: z.string().optional(),
          description: z.string().optional(),
          account_id: z.string().optional()
        })
      },
      async ({ opportunity_data }) => {
        await this.api.ensureLoggedIn();
        const createParams = {
          session: this.api.sessionId,
          module_name: "Opportunities",
          name_value_list: Object.entries(opportunity_data).map(([key, value]) => ({
            name: key,
            value: value
          }))
        };
        
        const result = await this.api.call("set_entry", createParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Update Opportunity Tool
    this.server.tool(
      "update_opportunity",
      {
        opportunity_id: z.string(),
        opportunity_data: z.object({
          name: z.string().optional(),
          amount: z.string().optional(),
          sales_stage: z.string().optional(),
          probability: z.string().optional(),
          date_closed: z.string().optional(),
          next_step: z.string().optional(),
          lead_source: z.string().optional(),
          description: z.string().optional()
        })
      },
      async ({ opportunity_id, opportunity_data }) => {
        await this.api.ensureLoggedIn();
        const updateParams = {
          session: this.api.sessionId,
          module_name: "Opportunities",
          name_value_list: [
            { name: "id", value: opportunity_id },
            ...Object.entries(opportunity_data).map(([key, value]) => ({
              name: key,
              value: value
            }))
          ]
        };
        
        const result = await this.api.call("set_entry", updateParams);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // Add more tools here for other SuiteCRM operations...
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return SuiteCRMMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return SuiteCRMMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
