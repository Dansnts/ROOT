"use client";

import { useEffect } from "react";
import { usePagesStore } from "@/stores/pagesStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Bootstraps all stores on first render: settings → categories → pages → tags.
 * If no pages exist, creates a default "Brouillon" page.
 */
export function useAppInit() {
  const { loadPages, newPage } = usePagesStore();
  const { loadTags }           = useTagsStore();
  const { loadCategories }     = useCategoriesStore();
  const { loadSettings }       = useSettingsStore();

  useEffect(() => {
    loadTags();
    loadSettings().then(() => loadCategories());
    loadPages().then(() => {
      const { pages: loaded, activePageId: active } = usePagesStore.getState();
      if (loaded.length === 0) {
        newPage("Brouillon");
      } else if (!active) {
        const firstPage = [...loaded]
          .sort((a, b) => a.createdAt - b.createdAt)
          .find((p) => !p.isFolder) ?? loaded[0];
        usePagesStore.setState({ activePageId: firstPage.id });
      }
    });
  }, [loadCategories, loadPages, loadSettings, loadTags, newPage]);
}
