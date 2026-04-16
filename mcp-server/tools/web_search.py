import asyncio
from duckduckgo_search import DDGS
import json
import yfinance as yf

async def search_web(query: str, max_results: int = 3) -> str:
    """
    Search the web using DuckDuckGo (News and Text) and yfinance fallback, return a summarized JSON.
    Useful for finding current events, stock news, or general knowledge.
    """
    try:
        results = []
        # Attempt DuckDuckGo News first which works better
        try:
            with DDGS() as ddgs:
                for r in ddgs.news(query, max_results=max_results):
                    results.append({
                        "title": r.get('title', ''),
                        "href": r.get('url', ''),
                        "body": r.get('body', '')
                    })
        except Exception:
            pass

        # Attempt standard Text Search if no news
        if not results:
            try:
                with DDGS() as ddgs:
                    for r in ddgs.text(query, max_results=max_results):
                        results.append({
                            "title": r.get('title', ''),
                            "href": r.get('href', ''),
                            "body": r.get('body', '')
                        })
            except Exception:
                pass
                
        # Absolute fallback for stocks using yfinance
        if not results:
            try:
                # E.g. "Reliance news" -> split -> "Reliance"
                # This works nicely with US stocks like "AAPL"
                term = query.split()[0].upper()
                ticker = yf.Ticker(term)
                news = ticker.news
                if news:
                    for n in news[:max_results]:
                        results.append({
                            "title": n.get('title', ''),
                            "href": n.get('link', ''),
                            "body": f"Published by {n.get('publisher', 'Unknown')}"
                        })
            except Exception:
                pass

        if not results:
            return json.dumps({"status": "no_results", "query": query})
            
        return json.dumps({
            "status": "success",
            "query": query,
            "results": results
        }, indent=2)
        
    except Exception as e:
        return json.dumps({
            "status": "error",
            "query": query,
            "error_message": str(e)
        })

def register_web_search_tools(mcp):
    mcp.tool()(search_web)
