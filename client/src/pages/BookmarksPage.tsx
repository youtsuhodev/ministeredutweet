import AppShell from '../components/AppShell';
import PageHeader from '../components/PageHeader';
import type { Post } from '../components/PostCard';
import PostList from '../components/PostList';
import PullToRefresh from '../components/PullToRefresh';
import { usePaged } from '../hooks/usePaged';
import { api } from '../services/api';

/* Marque-pages privés : même présentation que le fil, mais un par utilisateur et visible de lui seul. */
export default function BookmarksPage() {
  const bookmarks = usePaged<Post>((offset) => api.get<Post[]>(`/posts/bookmarks?offset=${offset}`));

  return (
    <AppShell onPosted={bookmarks.reload}>
      <PageHeader title="Enregistrés" back="/" />

      <PullToRefresh onRefresh={bookmarks.reload}>
        <PostList
          posts={bookmarks.items}
          loading={bookmarks.loading}
          loadingMore={bookmarks.loadingMore}
          hasMore={bookmarks.hasMore}
          error={bookmarks.error}
          emptyText="Aucun post enregistré pour le moment. Touche le bouton 🔖 sous un post pour le garder ici (c'est privé : toi seul peux les voir)."
          onLoadMore={bookmarks.loadMore}
          onRetry={bookmarks.reload}
          onDelete={(id) => bookmarks.setItems((prev) => prev.filter((p) => p.feedId !== id))}
          onBlocked={(uid) =>
            bookmarks.setItems((prev) => prev.filter((p) => p.user.uid !== uid && p.repostedBy?.uid !== uid))
          }
        />
      </PullToRefresh>
    </AppShell>
  );
}
