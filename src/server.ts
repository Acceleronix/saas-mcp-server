import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EUOneAPIUtils, type EUOneEnvironment } from "./utils";
import { z } from "zod";

export class VirtualDataMCP extends McpAgent {
	server = new McpServer({
		name: "EUOne IoT MCP Server",
		version: "2.0.0",
	});

	async init() {
		const env = this.env as unknown as EUOneEnvironment;

		// Validate environment variables
		if (!env.BASE_URL || !env.APP_ID || !env.APP_SECRET || !env.INDUSTRY_CODE) {
			throw new Error("Missing required EUOne API environment variables: BASE_URL, APP_ID, APP_SECRET, INDUSTRY_CODE");
		}

		// Health check / login test tool
		this.addHealthCheckTool(env);

		// TSL model tool
		this.addTslModelTool(env);

		// Device list tool
		this.addDeviceListTool(env);
	}

	private addHealthCheckTool(env: EUOneEnvironment) {
		this.server.tool(
			"login_test",
			"Test EUOne API login and authentication status",
			{},
			async () => {
				try {
					const health = await EUOneAPIUtils.healthCheck(env);
					return {
						content: [
							{
								type: "text",
								text: `✅ EUOne API Login Test: ${health.status}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ EUOne API Login Test Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			},
		);
	}

	private addTslModelTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_tsl_model",
			"Get TSL (Thing Specification Language) model by product key",
			{
				type: "object",
				properties: {
					productKey: {
						type: "string",
						description: "The product key to query TSL model for",
					},
				},
				required: ["productKey"],
			},
			async (args) => {
				try {
					console.log("get_tsl_model args received:", JSON.stringify(args, null, 2));
					console.log("get_tsl_model args type:", typeof args);
					console.log("get_tsl_model args keys:", args ? Object.keys(args) : "null/undefined");
					
					// Handle different possible argument formats
					let productKey: string;
					
					if (!args) {
						throw new Error("No arguments provided - productKey parameter is required");
					}
					
					// Check if args.productKey exists
					if (args.productKey) {
						productKey = args.productKey;
					}
					// Check if args itself is the productKey (string parameter)
					else if (typeof args === "string") {
						productKey = args;
					}
					// Check if the first argument is productKey
					else if (args[0]) {
						productKey = args[0];
					}
					else {
						throw new Error("productKey parameter is required - please provide a valid product key");
					}
					
					// Validate productKey
					if (!productKey || typeof productKey !== "string") {
						throw new Error("productKey must be a non-empty string");
					}
					
					const validatedProductKey = z.string().min(1).parse(productKey);
					console.log("Validated productKey:", validatedProductKey);
					
					const tslData = await EUOneAPIUtils.getTslModel(env, validatedProductKey);

					// Format the TSL model data for display
					let responseText = `📋 TSL Model for Product Key: ${validatedProductKey}\n\n`;
					
					if (tslData.profile) {
						responseText += `**Profile Information:**\n`;
						responseText += `- Product Key: ${tslData.profile.productKey || 'N/A'}\n`;
						responseText += `- Version: ${tslData.profile.version || 'N/A'}\n\n`;
					}

					if (tslData.properties && Array.isArray(tslData.properties)) {
						responseText += `**Properties (${tslData.properties.length}):**\n`;
						tslData.properties.forEach((prop: any, index: number) => {
							responseText += `${index + 1}. **${prop.identifier || 'Unknown'}** - ${prop.name || 'No name'}\n`;
							responseText += `   - Type: ${prop.dataType?.type || 'Unknown'}\n`;
							responseText += `   - Access: ${prop.accessMode || 'Unknown'}\n`;
							if (prop.description) {
								responseText += `   - Description: ${prop.description}\n`;
							}
							responseText += `\n`;
						});
					}

					if (tslData.services && Array.isArray(tslData.services)) {
						responseText += `**Services (${tslData.services.length}):**\n`;
						tslData.services.forEach((service: any, index: number) => {
							responseText += `${index + 1}. **${service.identifier || 'Unknown'}** - ${service.name || 'No name'}\n`;
							if (service.description) {
								responseText += `   - Description: ${service.description}\n`;
							}
							responseText += `\n`;
						});
					}

					if (tslData.events && Array.isArray(tslData.events)) {
						responseText += `**Events (${tslData.events.length}):**\n`;
						tslData.events.forEach((event: any, index: number) => {
							responseText += `${index + 1}. **${event.identifier || 'Unknown'}** - ${event.name || 'No name'}\n`;
							if (event.description) {
								responseText += `   - Description: ${event.description}\n`;
							}
							responseText += `\n`;
						});
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("get_tsl_model error:", error);
					
					let errorMessage = "Unknown error";
					if (error instanceof Error) {
						errorMessage = error.message;
					} else if (typeof error === "object" && error !== null) {
						errorMessage = JSON.stringify(error, null, 2);
					}
					
					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting TSL model: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceListTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_list",
			"Get list of devices with optional filtering parameters",
			{
				type: "object",
				properties: {
					deviceQueryKey: {
						type: "string",
						description: "Device name/DeviceKey/Device SN for search",
					},
					enableListSubData: {
						type: "boolean",
						description: "Whether to show sub-level data (default: false)",
					},
					onlineStatus: {
						type: "number",
						description: "Online status filter: 0=offline, 1=online",
					},
					pageNum: {
						type: "number",
						description: "Page number (default: 1)",
					},
					pageSize: {
						type: "number",
						description: "Page size (default: 10)",
					},
					productId: {
						type: "number",
						description: "Product ID filter",
					},
					runningStatus: {
						type: "number",
						description: "Running status: 1=normal, 2=warning, 3=fault, 4=fault+warning",
					},
					orgId: {
						type: "number",
						description: "Organization ID filter",
					},
				},
				required: [],
			},
			async (args) => {
				try {
					console.log("get_device_list args received:", JSON.stringify(args, null, 2));
					
					// Parse and validate arguments
					const options: any = {};
					
					if (args && typeof args === "object") {
						if (args.deviceQueryKey) options.deviceQueryKey = args.deviceQueryKey;
						if (typeof args.enableListSubData === "boolean") options.enableListSubData = args.enableListSubData;
						if (typeof args.onlineStatus === "number") options.onlineStatus = args.onlineStatus;
						if (typeof args.pageNum === "number") options.pageNum = args.pageNum;
						if (typeof args.pageSize === "number") options.pageSize = args.pageSize;
						if (typeof args.productId === "number") options.productId = args.productId;
						if (typeof args.runningStatus === "number") options.runningStatus = args.runningStatus;
						if (typeof args.orgId === "number") options.orgId = args.orgId;
					}

					console.log("Processed options:", JSON.stringify(options, null, 2));
					
					const deviceList = await EUOneAPIUtils.getDeviceList(env, options);

					// Format the device list data for display
					let responseText = `📱 Device List (Page ${options.pageNum || 1})\n\n`;
					
					if (!deviceList || deviceList.length === 0) {
						responseText += "No devices found.\n";
					} else {
						responseText += `**Found ${deviceList.length} devices:**\n\n`;
						
						deviceList.forEach((device: any, index: number) => {
							responseText += `${index + 1}. **${device.deviceName || device.deviceKey || 'Unknown Device'}**\n`;
							responseText += `   - Device ID: ${device.deviceId || 'N/A'}\n`;
							responseText += `   - Device Key: ${device.deviceKey || 'N/A'}\n`;
							responseText += `   - Device SN: ${device.deviceSn || 'N/A'}\n`;
							responseText += `   - Product: ${device.productName || 'N/A'} (ID: ${device.productId || 'N/A'})\n`;
							responseText += `   - Online Status: ${device.onlineStatus === 1 ? '🟢 Online' : '🔴 Offline'}\n`;
							
							// Running status
							const statusMap: { [key: number]: string } = {
								1: '✅ Normal',
								2: '⚠️ Warning',
								3: '❌ Fault',
								4: '⚠️❌ Fault + Warning'
							};
							responseText += `   - Running Status: ${statusMap[device.runningStatus] || 'Unknown'}\n`;
							
							// Activation status
							responseText += `   - Activation: ${device.activationStatus === 1 ? 'Activated' : 'Not Activated'}\n`;
							
							// Network type
							const netWayMap: { [key: number]: string } = {
								1: 'WiFi',
								2: 'Cellular',
								3: 'NB-IoT',
								4: 'Other',
								5: 'Bluetooth'
							};
							responseText += `   - Network: ${netWayMap[device.netWay] || 'Unknown'}\n`;
							
							// Organization
							if (device.orgName) {
								responseText += `   - Organization: ${device.orgName}\n`;
							}
							
							// Last online time
							if (device.tsLastOnlineTime) {
								const lastOnline = new Date(device.tsLastOnlineTime).toLocaleString();
								responseText += `   - Last Online: ${lastOnline}\n`;
							}
							
							responseText += `\n`;
						});
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("get_device_list error:", error);
					
					let errorMessage = "Unknown error";
					if (error instanceof Error) {
						errorMessage = error.message;
					} else if (typeof error === "object" && error !== null) {
						errorMessage = JSON.stringify(error, null, 2);
					}
					
					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting device list: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}
}