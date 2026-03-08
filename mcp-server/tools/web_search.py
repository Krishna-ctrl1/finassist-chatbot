import asyncio
from duckduckgo_search import DDGS
import json

async def search_web(query: str, max_results: int = 3) -> str:
    """
    Search the web using DuckDuckGo and return a summarized JSON string of the top results.
    Useful for finding current events, stock news, or general knowledge.
    
    Args:
        query: The search query string.
        max_results: The maximum number of results to return.
    """
    try:
        results = []
        # DDGS.text generator is synchronous, so we run it in a thread
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get('title'),
                    "href": r.get('href'),
                    "body": r.get('body')
                })
        
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
