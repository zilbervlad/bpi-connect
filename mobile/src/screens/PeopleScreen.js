import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
} from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { UserAvatar } from "../components/UserAvatar";

const roleOrder = {
  Admin: 1,
  HR: 2,
  Coach: 3,
  "General Manager": 4,
  MIT: 5,
  TM: 6,
};

const roleFilters = [
  "All",
  "Admin",
  "HR",
  "Coach",
  "General Manager",
  "MIT",
  "TM",
];

export function PeopleScreen({ user, users, usingApi, onStartMessage }) {
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("All");
  const [selectedStore, setSelectedStore] = useState("All");

  const scopedUsers = useMemo(() => {
    const currentRole = formatRole(user.role);
    const currentStoreKey = getStoreKey(user);
    const currentArea = String(user.area || "").trim().toLowerCase();

    const canViewAll = currentRole === "Admin" || currentRole === "HR";
    const canViewArea = currentRole === "Coach";

    return users.filter((item) => {
      if (item.id === user.id) return false;
      if (item.is_active === false) return false;

      if (canViewAll) return true;

      const itemStoreKey = getStoreKey(item);
      const itemArea = String(item.area || "").trim().toLowerCase();

      if (canViewArea) {
        if (!currentArea) return true;
        return itemArea === currentArea;
      }

      if (currentStoreKey && currentStoreKey !== "company") {
        return itemStoreKey === currentStoreKey;
      }

      if (currentArea) {
        return itemArea === currentArea;
      }

      return itemStoreKey === currentStoreKey;
    });
  }, [users, user]);

  const storeFilters = useMemo(() => {
    const currentRole = formatRole(user.role);
    const canViewStoreFilters =
      currentRole === "Admin" ||
      currentRole === "HR" ||
      currentRole === "Coach";

    if (!canViewStoreFilters) {
      return [{ key: "All", label: "My Store" }];
    }

    const storeMap = new Map();

    scopedUsers.forEach((item) => {
      const key = getStoreKey(item);
      const label = getStoreLabel(item);

      if (key && key !== "company") {
        storeMap.set(key, label);
      }
    });

    return [
      { key: "All", label: currentRole === "Coach" ? "My Area" : "All Stores" },
      ...Array.from(storeMap.entries())
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label))),
    ];
  }, [scopedUsers, user.role]);

  const visibleUsers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return scopedUsers
      .filter((item) => {
        if (selectedRole === "All") return true;
        return formatRole(item.role) === selectedRole;
      })
      .filter((item) => {
        if (selectedStore === "All") return true;
        return getStoreKey(item) === selectedStore;
      })
      .filter((item) => {
        if (!searchValue) return true;

        return (
          item.name?.toLowerCase().includes(searchValue) ||
          item.email?.toLowerCase().includes(searchValue) ||
          formatRole(item.role).toLowerCase().includes(searchValue) ||
          getStoreLabel(item).toLowerCase().includes(searchValue)
        );
      })
      .sort(sortPeople);
  }, [scopedUsers, search, selectedRole, selectedStore]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={visibleUsers}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={18}
        maxToRenderPerBatch={20}
        windowSize={8}
        contentContainerStyle={styles.screenContent}
        ListHeaderComponent={
          <>
            <HeaderBlock
              eyebrow="DIRECTORY"
              title="People"
              subtitle={`${visibleUsers.length} shown · ${getDirectoryScopeLabel(user)}`}
            />

            <View style={localStyles.searchCard}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, role, email, or store..."
                placeholderTextColor="#7b8da0"
                autoCapitalize="none"
                style={localStyles.searchInput}
              />

              <FlatList
                horizontal
                data={roleFilters}
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={localStyles.filterRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      localStyles.filterPill,
                      selectedRole === item && localStyles.filterPillActive,
                    ]}
                    onPress={() => setSelectedRole(item)}
                    activeOpacity={0.84}
                  >
                    <Text
                      style={[
                        localStyles.filterPillText,
                        selectedRole === item && localStyles.filterPillTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />

              <FlatList
                horizontal
                data={storeFilters}
                keyExtractor={(item) => item.key}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={localStyles.filterRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      localStyles.storePill,
                      selectedStore === item.key && localStyles.storePillActive,
                    ]}
                    onPress={() => setSelectedStore(item.key)}
                    activeOpacity={0.84}
                  >
                    <Text
                      style={[
                        localStyles.storePillText,
                        selectedStore === item.key && localStyles.storePillTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            <View style={localStyles.groupCard}>
              {visibleUsers.length ? null : (
                <View style={localStyles.emptyState}>
                  <Text style={localStyles.emptyTitle}>No people found</Text>
                  <Text style={localStyles.emptyText}>
                    Try another name, role, email, or store.
                  </Text>
                </View>
              )}
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <View style={localStyles.groupCard}>
            <View style={localStyles.personRow}>
              <UserAvatar user={item} name={item.name} size={34} />

              <View style={localStyles.personMain}>
                <View style={localStyles.personTop}>
                  <Text style={localStyles.personName} numberOfLines={1}>
                    {item.name}
                  </Text>

                  <Text style={localStyles.rolePill}>
                    {formatRoleShort(item.role)}
                  </Text>
                </View>

                <Text style={localStyles.personMeta} numberOfLines={1}>
                  {formatRole(item.role)} · {getStoreLabel(item)}
                </Text>

                {item.email ? (
                  <Text style={localStyles.personEmail} numberOfLines={1}>
                    {item.email}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={localStyles.messageButton}
                onPress={() => onStartMessage?.(item)}
                activeOpacity={0.84}
              >
                <Text style={localStyles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={localStyles.rowGap} />}
        ListFooterComponent={<View style={{ height: 12 }} />}
      />
    </View>
  );
}

function getDirectoryScopeLabel(user) {
  const role = formatRole(user.role);

  if (role === "Admin" || role === "HR") {
    return "Company directory";
  }

  if (role === "Coach") {
    return user.area ? `${user.area} area` : "Coach directory";
  }

  return getStoreLabel(user);
}

function formatRole(role) {
  if (!role) return "Team Member";

  const map = {
    admin: "Admin",
    hr: "HR",
    coach: "Coach",
    supervisor: "Coach",
    general_manager: "General Manager",
    manager: "MIT",
    tm: "TM",
  };

  return map[role] || role;
}

function formatRoleShort(role) {
  const formatted = formatRole(role);

  const map = {
    "General Manager": "GM",
    Coach: "Coach",
    MIT: "MIT",
    "Team Member": "TM",
  };

  return map[formatted] || formatted;
}

function getStoreKey(person) {
  if (person.store) return String(person.store);
  if (person.store_number) return String(person.store_number);
  if (person.store_name) return String(person.store_name);
  if (person.storeGroupId) return String(person.storeGroupId);
  return "company";
}

function getStoreLabel(person) {
  if (person.store_name) return person.store_name;
  if (person.store) return `Store ${person.store}`;
  if (person.store_number) return `Store ${person.store_number}`;
  if (person.area) return person.area;
  return "Company";
}

function sortPeople(a, b) {
  const roleA = roleOrder[formatRole(a.role)] || 99;
  const roleB = roleOrder[formatRole(b.role)] || 99;

  if (roleA !== roleB) return roleA - roleB;

  const storeA = getStoreLabel(a);
  const storeB = getStoreLabel(b);

  if (storeA !== storeB) return storeA.localeCompare(storeB);

  return String(a.name || "").localeCompare(String(b.name || ""));
}

const localStyles = StyleSheet.create({
  searchCard: {
    backgroundColor: "#101d2c",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#203044",
    padding: 10,
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
    paddingRight: 10,
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
  filterPillText: {
    color: "#9aacbf",
    fontSize: 10,
    fontWeight: "900",
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
  storePill: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: 130,
  },
  storePillActive: {
    backgroundColor: "#26364a",
  },
  storePillText: {
    color: "#9aacbf",
    fontSize: 10,
    fontWeight: "900",
  },
  storePillTextActive: {
    color: "#ffffff",
  },
  groupCard: {
    backgroundColor: "#101d2c",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#203044",
    overflow: "hidden",
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    minHeight: 54,
    gap: 8,
  },
  personMain: {
    flex: 1,
    minWidth: 0,
  },
  personTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  personName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  rolePill: {
    color: "#ffffff",
    backgroundColor: "#26364a",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  personMeta: {
    color: "#9aacbf",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 1,
  },
  personEmail: {
    color: "#708399",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  messageButton: {
    backgroundColor: "#ef1745",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  messageButtonText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  rowGap: {
    height: 5,
  },
  emptyState: {
    padding: 12,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    color: "#9aacbf",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
});
