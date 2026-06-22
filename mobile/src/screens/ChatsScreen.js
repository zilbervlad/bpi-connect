import {
  Alert, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet } from "react-native";
import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";


function getThreadActivityMs(thread) {
  const rawValue =
    thread.last_time ||
    thread.lastTime ||
    thread.lastMessageAt ||
    thread.last_message_at ||
    thread.updated_at ||
    thread.created_at ||
    thread.createdAt;

  const parsed = rawValue ? Date.parse(rawValue) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ChatsScreen({
  threads,
  onOpenThread,
  onToggleMute,
  onToggleFavorite,
  onDeleteThread,
}) {
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const unreadCount = threads.reduce((total, thread) => total + (thread.unread || 0), 0);

  const handleLongPressThread = (thread) => {
    const isDirect =
      thread.thread_type === "direct" ||
      thread.type === "direct" ||
      thread.kind === "direct";

    if (!isDirect) return;

    Alert.alert(
      "Delete conversation?",
      "This removes the direct message thread from your inbox only.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDeleteThread?.(thread.id),
        },
      ]
    );
  };


  const sortedThreads = useMemo(() => {
    const searchValue = searchText.trim().toLowerCase();

    return [...threads]
      .filter((thread) => {
        const isFavorite = Boolean(thread.favorite);

        if (activeFilter === "favorites" && !isFavorite) return false;
        if (activeFilter === "unread" && !(thread.unread > 0)) return false;
        if (activeFilter === "stores" && thread.type !== "store") return false;
        if (activeFilter === "roles" && thread.type !== "role") return false;
        if (activeFilter === "direct" && thread.type !== "direct") return false;
        if (activeFilter === "company" && thread.type !== "company") return false;

        if (!searchValue) return true;

        return (
          String(thread.name || "").toLowerCase().includes(searchValue) ||
          String(thread.lastMessage || "").toLowerCase().includes(searchValue) ||
          String(thread.type || "").toLowerCase().includes(searchValue)
        );
      })
      .sort((a, b) => {
        const aFav = Boolean(a.favorite);
        const bFav = Boolean(b.favorite);

        if (aFav !== bFav) return aFav ? -1 : 1;

        const aUnread = Number(a.unread || 0) > 0;
        const bUnread = Number(b.unread || 0) > 0;

        if (aUnread !== bUnread) return aUnread ? -1 : 1;

        const aActivity = getThreadActivityMs(a);
        const bActivity = getThreadActivityMs(b);

        if (aActivity !== bActivity) {
          return bActivity - aActivity;
        }

        const aStore = getStoreNumber(a);
        const bStore = getStoreNumber(b);

        if (a.type === "store" && b.type === "store" && aStore && bStore) {
          return Number(aStore) - Number(bStore);
        }

        const typeOrder = {
          company: 1,
          area: 2,
          role: 3,
          store: 4,
          direct: 5,
          group: 6,
        };

        const aOrder = typeOrder[a.type] || 99;
        const bOrder = typeOrder[b.type] || 99;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }, [threads, searchText, activeFilter]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={localStyles.heroCard}>
        <Text style={localStyles.heroEyebrow}>CHATS</Text>
        <Text style={localStyles.heroTitle}>Messages</Text>
        <Text style={localStyles.heroSubtitle}>
          {threads.length} threads · {unreadCount} unread
        </Text>
      </View>

      <View style={localStyles.searchCard}>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search chats..."
          placeholderTextColor="#7b8da0"
          autoCapitalize="none"
          style={localStyles.searchInput}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={localStyles.filterRow}
        >
          {[
            { label: "All", value: "all" },
            { label: "★ Favorites", value: "favorites" },
            { label: `Unread${unreadCount ? ` (${unreadCount})` : ""}`, value: "unread" },
            { label: "Stores", value: "stores" },
            { label: "Roles", value: "roles" },
            { label: "Direct", value: "direct" },
            { label: "Company", value: "company" },
          ].map((filter) => {
            const isActive = activeFilter === filter.value;

            return (
              <TouchableOpacity
                key={filter.value}
                style={[localStyles.filterPill, isActive && localStyles.filterPillActive]}
                onPress={() => setActiveFilter(filter.value)}
                activeOpacity={0.84}
              >
                <Text style={[localStyles.filterText, isActive && localStyles.filterTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={localStyles.groupCard}>
        {sortedThreads.length ? (
          sortedThreads.map((thread, index) => {
            const isFavorite = Boolean(thread.favorite);
            const hasUnread = Number(thread.unread || 0) > 0;

            return (
              <View key={thread.id}>
                <View style={[localStyles.threadRow, hasUnread && localStyles.threadRowUnread]}>
                  <View style={[localStyles.unreadAccent, hasUnread && localStyles.unreadAccentActive]} />

                  <TouchableOpacity
                    style={localStyles.threadOpenArea}
                    onPress={() => onOpenThread(thread)}
                    onLongPress={() => handleLongPressThread(thread)}
                    delayLongPress={450}
                    activeOpacity={0.84}
                  >
                    <ThreadAvatar thread={thread} hasUnread={hasUnread} />

                    <View style={localStyles.threadMain}>
                      <View style={localStyles.threadTop}>
                        <Text style={[localStyles.threadName, hasUnread && localStyles.threadNameUnread]} numberOfLines={1}>
                          {thread.name}
                        </Text>

                        {thread.unread > 0 ? (
                          <View style={localStyles.unreadBadge}>
                            <Text style={localStyles.unreadText}>{thread.unread}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={localStyles.previewRow}>
                        <Text style={[localStyles.typePill, hasUnread && localStyles.typePillUnread]}>
                          {formatThreadType(thread.type)}
                        </Text>

                        <Text style={[localStyles.threadPreview, hasUnread && localStyles.threadPreviewUnread]} numberOfLines={1}>
                          {thread.lastMessage || "No messages yet"}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={localStyles.rightRail}>
                    <Text style={[localStyles.threadTime, hasUnread && localStyles.threadTimeUnread]}>{thread.lastTime}</Text>

                    <View style={localStyles.iconRow}>
                      <TouchableOpacity
                        style={[
                          localStyles.favoriteButton,
                          isFavorite && localStyles.favoriteButtonActive,
                        ]}
                        onPress={() => onToggleFavorite?.(thread.id, !thread.favorite)}
                        activeOpacity={0.84}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={localStyles.favoriteText}>
                          {isFavorite ? "★" : "☆"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          localStyles.threadMuteButton,
                          thread.muted && localStyles.threadMuteButtonActive,
                        ]}
                        onPressIn={() => onToggleMute?.(thread.id, !thread.muted)}
                        activeOpacity={0.84}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={localStyles.threadMuteText}>
                          {thread.muted ? "🔕" : "🔔"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {index < sortedThreads.length - 1 ? (
                  <View style={[localStyles.divider, hasUnread && localStyles.dividerUnread]} />
                ) : null}
              </View>
            );
          })
        ) : (
          <View style={localStyles.emptyState}>
            <Text style={localStyles.emptyTitle}>No chats yet</Text>
            <Text style={localStyles.emptyText}>
              Try another search or filter.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ThreadAvatar({ thread, hasUnread }) {
  if (thread.type === "direct" && thread.members?.length) {
    const otherMember =
      thread.members.find((member) => member.id !== thread.currentUserId) ||
      thread.members[0];

    return <UserAvatar user={otherMember} name={thread.name} size={34} />;
  }

  return (
    <View
      style={[
        localStyles.avatar,
        thread.type === "store" && localStyles.storeAvatar,
        hasUnread && localStyles.avatarUnread,
      ]}
    >
      <Text style={localStyles.avatarText}>{getAvatarLabel(thread)}</Text>
    </View>
  );
}

function getAvatarLabel(thread) {
  if (thread.type === "store") {
    const storeNumber = getStoreNumber(thread);
    return storeNumber ? storeNumber.slice(-2) : "ST";
  }

  const map = {
    company: "ALL",
    area: "AR",
    role: "RL",
    group: "GR",
  };

  return map[thread.type] || "CH";
}

function getStoreNumber(thread) {
  const match = String(thread.name || "").match(/\d+/);
  return match ? match[0] : "";
}

function formatThreadType(type) {
  const map = {
    company: "Company",
    area: "Area",
    store: "Store",
    role: "Role",
    direct: "DM",
    group: "Group",
  };

  return map[type] || "Chat";
}

const localStyles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  heroEyebrow: {
    color: "#ef1745",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 6,
  },
  heroTitle: {
    color: "#10212b",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  heroSubtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  searchCard: {
    backgroundColor: "#101d2c",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#203044",
    padding: 8,
    marginBottom: 8,
    gap: 7,
  },
  searchInput: {
    backgroundColor: "#0b1624",
    borderWidth: 1,
    borderColor: "#203044",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  filterRow: {
    gap: 6,
    paddingRight: 8,
  },
  filterPill: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  filterPillActive: {
    backgroundColor: "#ef1745",
  },
  filterText: {
    color: "#9aacbf",
    fontSize: 10,
    fontWeight: "900",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  groupCard: {
    backgroundColor: "#101d2c",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#203044",
    overflow: "hidden",
    marginBottom: 18,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    minHeight: 54,
  },
  threadRowUnread: {
    backgroundColor: "rgba(239,23,69,0.13)",
    borderLeftWidth: 0,
  },
  unreadAccent: {
    width: 4,
    height: 40,
    borderRadius: 999,
    backgroundColor: "transparent",
    marginRight: 8,
  },
  unreadAccentActive: {
    backgroundColor: "#ef1745",
  },
  threadOpenArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef1745",
  },
  storeAvatar: {
    backgroundColor: "#e91f3f",
  },
  avatarUnread: {
    shadowColor: "#ef1745",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  threadMain: {
    flex: 1,
    minWidth: 0,
  },
  threadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  threadName: {
    color: "#d9e4ef",
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  threadNameUnread: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  threadTime: {
    color: "#8fa1b6",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "right",
  },
  threadTimeUnread: {
    color: "#ffffff",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  typePill: {
    color: "#ffffff",
    backgroundColor: "#26364a",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  typePillUnread: {
    backgroundColor: "#ef1745",
  },
  threadPreview: {
    color: "#9aacbf",
    fontSize: 11,
    fontWeight: "800",
    flex: 1,
  },
  threadPreviewUnread: {
    color: "#ffffff",
    fontWeight: "900",
  },
  rightRail: {
    width: 56,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    marginLeft: 6,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  favoriteButton: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButtonActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  favoriteText: {
    color: "#ffd166",
    fontSize: 13,
    fontWeight: "900",
  },
  threadMuteButton: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  threadMuteButtonActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  threadMuteText: {
    fontSize: 10,
  },
  unreadBadge: {
    backgroundColor: "#ef1745",
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ef1745",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    backgroundColor: "#203044",
    marginLeft: 52,
  },
  dividerUnread: {
    backgroundColor: "rgba(239,23,69,0.28)",
  },
  emptyState: {
    padding: 14,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#9aacbf",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 4,
  },
});
