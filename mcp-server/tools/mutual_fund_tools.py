from mftool import Mftool
from fastmcp import FastMCP
from typing import Annotated
from pydantic import Field
from mcp.types import ImageContent
from models import RichToolDescription
from services.chart_service import ChartService

mf = Mftool()

def register_mutual_fund_tools(mcp: FastMCP):
    @mcp.tool
    def get_mutual_fund_nav(scheme_code: str) -> str:
        """Get latest NAV for a mutual fund. Args: scheme_code (e.g. '119551')"""
        try:
            quote = mf.get_scheme_quote(scheme_code)
            return str(quote) if quote else "Scheme not found."
        except Exception as e:
            return f"Error: {e}"

    @mcp.tool
    def search_mutual_funds(query: str) -> str:
        """Search mutual funds by name."""
        try:
            all_schemes = mf.get_scheme_codes()
            matches = {k: v for k, v in all_schemes.items() if query.lower() in v.lower()}
            return str(list(matches.items())[:10])
        except Exception as e:
            return f"Error: {e}"

    CREATE_MF_CHART_DESCRIPTION = RichToolDescription(
        description="Generate a historical NAV chart for a mutual fund. Optimized for visualizing fund performance over time.",
        use_when="When user wants to see a chart, graph, or visualization of a mutual fund's NAV.",
        side_effects="Creates and returns a PNG chart image showing historical NAV data."
    )

    @mcp.tool(description=CREATE_MF_CHART_DESCRIPTION.model_dump_json())
    async def create_mutual_fund_chart(
        scheme_code: Annotated[str, Field(description="The mutual fund scheme code (e.g., '119551')")],
        period: Annotated[str, Field(description="Time period (1mo, 3mo, 6mo, 1y, 3y, 5y)")] = "1y"
    ) -> list[ImageContent]:
        """Generate a historical NAV chart for a mutual fund"""
        try:
            chart_service = ChartService()
            chart_base64 = await chart_service.create_mutual_fund_chart(scheme_code, period)
            
            return [ImageContent(
                type="image",
                mimeType="image/png", 
                data=chart_base64
            )]
        except Exception as e:
            error_message = f"❌ Error generating chart for scheme {scheme_code}: {str(e)}"
            raise ValueError(error_message)