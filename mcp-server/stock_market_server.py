import asyncio
import os
from dotenv import load_dotenv
from fastmcp import FastMCP
# Removed broken auth imports

# Keep service imports
from services.stock_service import StockService
from services.market_data_service import MarketDataService
from services.chart_service import ChartService
from tools.stock_tools import register_stock_tools
from tools.market_analysis_tools import register_market_analysis_tools
from tools.chart_tools import register_chart_tools
from tools.analysis_tools import register_analysis_tools
from tools.screening_tools import register_screening_tools
from tools.info_tools import register_info_tools
from tools.mutual_fund_tools import register_mutual_fund_tools # Ensure this is here

# --- Load environment variables ---
load_dotenv()

# We keep these just in case your logic needs them, but we won't crash if they are missing for auth
MY_NUMBER = os.environ.get("MY_NUMBER", "DEV_MODE")

# --- MCP Server Setup (Simplified) ---
# Removed auth=SimpleBearerAuthProvider(TOKEN) to fix the error
mcp = FastMCP("Stock Market MCP Server")

# --- Tool: validate (Optional, kept for compatibility) ---
@mcp.tool
async def validate() -> str:
    return MY_NUMBER

# Register all tool modules
register_stock_tools(mcp)
register_market_analysis_tools(mcp)
register_chart_tools(mcp)
register_analysis_tools(mcp)
register_screening_tools(mcp)
register_info_tools(mcp)
register_mutual_fund_tools(mcp)

# --- Run MCP Server ---
async def main():
    try:
        port = int(os.environ.get("PORT", 8087))
        host = "0.0.0.0"
        
        print(f"📈 Starting Stock Market MCP server on http://{host}:{port}")
        
        await mcp.run_async("sse", host=host, port=port, path="/sse") 
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"💥 Server crashed: {e}")
        exit(1)