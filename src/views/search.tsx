import { useState } from "preact/hooks";
import { ArrowRight, Search } from "lucide-preact";
import type { OpenMindApi } from "../lib/api";
import { toClientError } from "../lib/api";
import type { SearchResult } from "../lib/types";
import { EmptyState, ErrorNotice, LoadingRow, ResultList } from "../components/common";

export function SearchView({ api, connected }: { api: OpenMindApi; connected: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (event: Event) => {
    event.preventDefault();
    const value = query.trim();
    if (!value || loading || !connected) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.search(value);
      setResults(response.results);
      setSearched(true);
    } catch (requestError) {
      setError(toClientError(requestError).message);
    } finally {
      setLoading(false);
    }
  };

  const openResult = async (result: SearchResult) => {
    try {
      await api.openFile(result.file_id);
    } catch (requestError) {
      setError(toClientError(requestError).message);
    }
  };

  const loadImagePreview = async (fileId: string) => (await api.imagePreview(fileId)).dataUrl;

  return (
    <div class={`page search-page${searched ? " has-results" : " is-pristine"}`}>
      <div class="search-experience">
        {!searched ? (
          <div class="search-intro">
            <div class="search-intro-icon" aria-hidden="true"><Search size={24} /></div>
            <h1>What are you looking for today?</h1>
            <p>Find anything on your computer.</p>
          </div>
        ) : (
          <header class="search-results-header">
            <h1>Search</h1>
            <span>{results.length} {results.length === 1 ? "result" : "results"}</span>
          </header>
        )}
        <form class="search-box search-box-primary" onSubmit={search}>
          <Search size={20} />
          <input
            type="search"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder={connected ? "Search your files" : "OpenMind is offline"}
            maxLength={4000}
            disabled={!connected}
            autofocus
          />
          <button class="primary-button" type="submit" disabled={!query.trim() || loading || !connected}>
            <span>Search</span>
            <ArrowRight class="mobile-search-button-icon" size={16} aria-hidden="true" />
          </button>
        </form>
      </div>

      {error ? <ErrorNotice message={error} /> : null}
      {loading ? <LoadingRow label="Searching" /> : null}
      {!loading && results.length > 0 ? (
        <ResultList results={results} onOpen={openResult} loadImagePreview={loadImagePreview} />
      ) : null}
      {!loading && searched && results.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="No matches" detail="Try a different phrase." />
      ) : null}
    </div>
  );
}
