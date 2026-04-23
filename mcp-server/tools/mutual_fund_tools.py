import httpx
from fastmcp import FastMCP
from typing import Annotated
from pydantic import Field
from mcp.types import ImageContent
from models import RichToolDescription
from services.chart_service import ChartService

# ─── MFAPI Configuration ───
MFAPI_BASE = "https://api.mfapi.in/mf"
MFAPI_TIMEOUT = 10  # seconds


async def _mfapi_search(query: str) -> list:
    """Search mutual funds using MFAPI. Returns list of {schemeCode, schemeName}."""
    try:
        async with httpx.AsyncClient(timeout=MFAPI_TIMEOUT) as client:
            resp = await client.get(f"{MFAPI_BASE}/search", params={"q": query})
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"MFAPI search failed: {e}")
        return []


async def _mfapi_latest_nav(scheme_code: str) -> dict:
    """Get latest NAV for a specific scheme from MFAPI."""
    try:
        async with httpx.AsyncClient(timeout=MFAPI_TIMEOUT) as client:
            resp = await client.get(f"{MFAPI_BASE}/{scheme_code}/latest")
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "SUCCESS":
                return data
            return {}
    except Exception as e:
        print(f"MFAPI latest NAV failed for {scheme_code}: {e}")
        return {}


async def _mfapi_full_data(scheme_code: str) -> dict:
    """Get full historical data for a scheme from MFAPI."""
    try:
        async with httpx.AsyncClient(timeout=MFAPI_TIMEOUT) as client:
            resp = await client.get(f"{MFAPI_BASE}/{scheme_code}")
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "SUCCESS":
                return data
            return {}
    except Exception as e:
        print(f"MFAPI full data failed for {scheme_code}: {e}")
        return {}


def _pick_direct_growth(results: list) -> dict:
    """Auto-select the Direct Growth plan from search results."""
    # Priority 1: Direct + Growth
    for fund in results:
        name = fund.get("schemeName", "").lower()
        if "direct" in name and "growth" in name:
            return fund

    # Priority 2: Direct plan (any variant)
    for fund in results:
        name = fund.get("schemeName", "").lower()
        if "direct" in name:
            return fund

    # Fallback: first result
    return results[0] if results else {}


def register_mutual_fund_tools(mcp: FastMCP):

    # ─── Tool 1: Search Mutual Funds ───
    SEARCH_MF_DESCRIPTION = RichToolDescription(
        description="Search for Indian mutual funds by name using MFAPI. Returns scheme codes and names with auto-selection of Direct Growth plans.",
        use_when="When user wants to find a mutual fund, look up a fund, compare funds, or get scheme details. Use this FIRST before fetching NAV.",
        side_effects="Fetches data from the public MFAPI (api.mfapi.in)."
    )

    @mcp.tool(description=SEARCH_MF_DESCRIPTION.model_dump_json())
    async def search_mutual_funds(
        query: Annotated[str, Field(description="Fund name to search (e.g., 'Parag Parikh Flexi Cap', 'HDFC Small Cap', 'SBI Bluechip')")]
    ) -> str:
        """Search mutual funds by name. Returns matching schemes with codes."""
        try:
            # Primary: MFAPI
            results = await _mfapi_search(query)

            if results:
                # Auto-select Direct Growth plan
                best = _pick_direct_growth(results)
                best_code = best.get("schemeCode", "")
                best_name = best.get("schemeName", "")

                output = f"🔍 **Mutual Fund Search Results for \"{query}\"**\n\n"
                output += f"📌 **Best Match (Direct Growth):** {best_name}\n"
                output += f"• **Scheme Code:** {best_code}\n\n"

                if len(results) > 1:
                    output += f"**All {min(len(results), 10)} matches:**\n"
                    for i, fund in enumerate(results[:10], 1):
                        marker = " ✅" if fund.get("schemeCode") == best_code else ""
                        output += f"{i}. {fund['schemeName']} (Code: {fund['schemeCode']}){marker}\n"

                return output

            # Fallback: mftool
            print("MFAPI search returned empty, falling back to mftool...")
            from mftool import Mftool
            mf = Mftool()
            all_schemes = mf.get_scheme_codes()
            matches = {k: v for k, v in all_schemes.items() if query.lower() in v.lower()}
            top_matches = list(matches.items())[:10]

            if not top_matches:
                return f"❌ No mutual funds found matching \"{query}\". Try a shorter or different name."

            output = f"🔍 **Mutual Fund Search Results for \"{query}\"**\n\n"
            for code, name in top_matches:
                output += f"• {name} (Code: {code})\n"
            return output

        except Exception as e:
            return f"❌ Error searching mutual funds: {str(e)}. Please try again or ask me about the fund in general terms."

    # ─── Tool 2: Get Mutual Fund NAV ───
    GET_MF_NAV_DESCRIPTION = RichToolDescription(
        description="Get the latest NAV (Net Asset Value) and metadata for an Indian mutual fund using its scheme code or fund name.",
        use_when="When user asks for the current NAV, price, or value of a mutual fund. Also use when comparing fund performance.",
        side_effects="Fetches live NAV data from MFAPI (api.mfapi.in)."
    )

    @mcp.tool(description=GET_MF_NAV_DESCRIPTION.model_dump_json())
    async def get_mutual_fund_nav(
        query: Annotated[str, Field(description="Scheme code (e.g. '122639') OR fund name (e.g. 'Parag Parikh Flexi Cap')")]
    ) -> str:
        """Get latest NAV for a mutual fund by scheme code or name."""
        try:
            scheme_code = query.strip()

            # If query is a name (not all digits), search first
            if not scheme_code.isdigit():
                results = await _mfapi_search(query)
                if not results:
                    return f"❌ Could not find a mutual fund matching \"{query}\". Try the exact fund name."

                best = _pick_direct_growth(results)
                scheme_code = str(best.get("schemeCode", ""))
                if not scheme_code:
                    return f"❌ No scheme code found for \"{query}\"."

            # Get latest NAV from MFAPI
            data = await _mfapi_latest_nav(scheme_code)

            if data and data.get("data"):
                meta = data.get("meta", {})
                nav_entry = data["data"][0]

                output = f"📊 **{meta.get('scheme_name', f'Scheme {scheme_code}')}**\n\n"
                output += f"• **Latest NAV:** ₹{nav_entry['nav']}\n"
                output += f"• **Date:** {nav_entry['date']}\n"
                output += f"• **Fund House:** {meta.get('fund_house', 'N/A')}\n"
                output += f"• **Category:** {meta.get('scheme_category', 'N/A')}\n"
                output += f"• **Type:** {meta.get('scheme_type', 'N/A')}\n"
                output += f"• **Scheme Code:** {scheme_code}\n"

                if meta.get('isin_growth'):
                    output += f"• **ISIN (Growth):** {meta['isin_growth']}\n"

                return output

            # Fallback: mftool
            print(f"MFAPI NAV failed for {scheme_code}, falling back to mftool...")
            from mftool import Mftool
            mf = Mftool()
            quote = mf.get_scheme_quote(scheme_code)
            if quote:
                output = f"📊 **{quote.get('scheme_name', f'Scheme {scheme_code}')}**\n\n"
                output += f"• **Latest NAV:** ₹{quote.get('last_updated', 'N/A')}\n"
                output += f"• **Scheme Code:** {scheme_code}\n"
                return output

            return f"❌ No data found for scheme code {scheme_code}. Please verify the code."

        except Exception as e:
            return f"❌ Error fetching NAV: {str(e)}. The mutual fund data service may be temporarily unavailable."

    # ─── Tool 3: Compare Mutual Funds ───
    COMPARE_MF_DESCRIPTION = RichToolDescription(
        description="Compare two or more Indian mutual funds side-by-side by fetching their latest NAV, fund house, and category from MFAPI.",
        use_when="When user wants to compare performance, NAVs, or details of two or more mutual funds.",
        side_effects="Fetches data from MFAPI for multiple funds."
    )

    @mcp.tool(description=COMPARE_MF_DESCRIPTION.model_dump_json())
    async def compare_mutual_funds(
        fund1: Annotated[str, Field(description="First fund name (e.g., 'Parag Parikh Flexi Cap')")],
        fund2: Annotated[str, Field(description="Second fund name (e.g., 'Motilal Oswal Midcap')")]
    ) -> str:
        """Compare two mutual funds side by side."""
        try:
            output = "📊 **Mutual Fund Comparison**\n\n"

            for i, fund_name in enumerate([fund1, fund2], 1):
                results = await _mfapi_search(fund_name)

                if not results:
                    output += f"**Fund {i}: {fund_name}**\n"
                    output += f"❌ Could not find this fund.\n\n"
                    continue

                best = _pick_direct_growth(results)
                code = str(best.get("schemeCode", ""))
                data = await _mfapi_latest_nav(code)

                if data and data.get("data"):
                    meta = data.get("meta", {})
                    nav_entry = data["data"][0]

                    output += f"**Fund {i}: {meta.get('scheme_name', fund_name)}**\n"
                    output += f"• **Latest NAV:** ₹{nav_entry['nav']}\n"
                    output += f"• **Date:** {nav_entry['date']}\n"
                    output += f"• **Fund House:** {meta.get('fund_house', 'N/A')}\n"
                    output += f"• **Category:** {meta.get('scheme_category', 'N/A')}\n"
                    output += f"• **Scheme Code:** {code}\n\n"
                else:
                    output += f"**Fund {i}: {best.get('schemeName', fund_name)}**\n"
                    output += f"• Scheme Code: {code}\n"
                    output += f"• ⚠️ NAV data currently unavailable.\n\n"

            output += "**Disclaimer:** Mutual fund investments are subject to market risks. Past performance is not indicative of future results."
            return output

        except Exception as e:
            return f"❌ Error comparing funds: {str(e)}. Please try again."

    # ─── Tool 4: Mutual Fund Chart ───
    CREATE_MF_CHART_DESCRIPTION = RichToolDescription(
        description="Generate a historical NAV chart for a mutual fund. Uses MFAPI for data and matplotlib for visualization.",
        use_when="When user wants to see a chart, graph, or visualization of a mutual fund's NAV history.",
        side_effects="Creates and returns a PNG chart image showing historical NAV data."
    )

    @mcp.tool(description=CREATE_MF_CHART_DESCRIPTION.model_dump_json())
    async def create_mutual_fund_chart(
        query: Annotated[str, Field(description="Scheme code (e.g., '122639') OR fund name (e.g., 'Parag Parikh Flexi Cap')")],
        period: Annotated[str, Field(description="Time period (1mo, 3mo, 6mo, 1y, 3y, 5y)")] = "1y"
    ) -> list[ImageContent]:
        """Generate a historical NAV chart for a mutual fund."""
        try:
            scheme_code = query.strip()

            # Resolve name to code if needed
            if not scheme_code.isdigit():
                results = await _mfapi_search(query)
                if not results:
                    raise ValueError(f"Could not find a mutual fund matching \"{query}\".")
                best = _pick_direct_growth(results)
                scheme_code = str(best.get("schemeCode", ""))

            chart_service = ChartService()
            chart_base64 = await chart_service.create_mutual_fund_chart(scheme_code, period)

            return [ImageContent(
                type="image",
                mimeType="image/png",
                data=chart_base64
            )]
        except Exception as e:
            error_message = f"❌ Error generating chart: {str(e)}"
            raise ValueError(error_message)