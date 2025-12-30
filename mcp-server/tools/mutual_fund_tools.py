from mftool import Mftool
from fastmcp import FastMCP

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