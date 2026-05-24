import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
} from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { UserAvatar } from "../components/UserAvatar";

const roleLabels = {
  admin: "Admin",
  hr: "HR",
  coach: "Coach",
  supervisor: "Supervisor",
  general_manager: "General Manager",
  manager: "Manager",
  tm: "TM",
  Admin: "Admin",
  HR: "HR",
  Coach: "Coach",
  Supervisor: "Supervisor",
  "General Manager": "General Manager",
  Manager: "Manager",
  TM: "TM",
};

const roleOrder = {
  Admin: 1,
  HR: 2,
  Coach: 3,
  Supervisor: 4,
  "General Manager": 5,
  Manager: 6,
  TM: 7,
};

export function PeopleScreen({ user, users, usingApi, onStartMessage }) {
  const [search, setSearch] = useState("");
  const [selectedStore, setSelectedStore] = useState("all");

  const visibleUsers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return users
      .filter((item) => item.id !== user.id)
      .filter((item) => item.is_active !== false)
      .filter((item) => {
        if (!searchValue) return true;

        return (
          item.name?.toLowerCase().includes(searchValue) ||
          item.email?.toLowerCase().includes(searchValue) ||
          formatRole(item.role).toLowerCase().includes(searchValue) ||
          getStoreLabel(item).toLowerCase().includes(searchValue)
        );
      })
      .filter((item) => {
        if (selectedStore === "all") return true;
        return getStoreKey(item) === selectedStore;
      })
      .sort(sortPeople);
  }, [users, user.id, search, selectedStore]);

  const stores = useMemo(() => {
    const storeMap = new Map();

    users.forEach((item) => {
      const key = getStoreKey(item);
      const label = getStoreLabel(item);

      if (!storeMap.has(key)) {
        storeMap.set(key, label);
      }
    });

    return [...storeMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => {
        if (a.key === "company") return 1;
        if (b.key === "company") return -1;
        return a.label.localeCompare(b.label);
      });
  }, [users]);

  const groupedPeople = useMemo(() => {
    const groups = new Map();

    visibleUsers.forEach((person) => {
      const key = getStoreKey(person);
      const label = getStoreLabel(person);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          people: [],
        });
      }

      groups.get(key).people.push(person);
    });

    return [...groups.values()].sort((a, b) => {
      if (a.key === "company") return 1;
      if (b.key === "company") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [visibleUsers]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="PEOPLE"
        title="Directory"
        subtitle={
          usingApi
            ? "Find people by store, name, email, or position."
            : "Demo directory"
        }
      />

      <View style={localStyles.searchCard}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search people, store, or position"
          placeholderTextColor="#7b8da0"
          style={localStyles.searchInput}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={localStyles.storeFilterRow}
        >
          <TouchableOpacity
            style={[
              localStyles.filterChip,
              selectedStore === "all" && localStyles.filterChipActive,
            ]}
            onPress={() => setSelectedStore("all")}
          >
            <Text
              style={[
                localStyles.filterText,
                selectedStore === "all" && localStyles.filterTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {stores.map((store) => (
            <TouchableOpacity
              key={store.key}
              style={[
                localStyles.filterChip,
                selectedStore === store.key && localStyles.filterChipActive,
              ]}
              onPress={() => setSelectedStore(store.key)}
            >
              <Text
                style={[
                  localStyles.filterText,
                  selectedStore === store.key && localStyles.filterTextActive,
                ]}
              >
                {store.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={localStyles.summaryRow}>
        <View style={localStyles.summaryBox}>
          <Text style={localStyles.summaryNumber}>{visibleUsers.length}</Text>
          <Text style={localStyles.summaryLabel}>People</Text>
        </View>

        <View style={localStyles.summaryBox}>
          <Text style={localStyles.summaryNumber}>{groupedPeople.length}</Text>
          <Text style={localStyles.summaryLabel}>Groups</Text>
        </View>
      </View>

      {groupedPeople.length ? (
        groupedPeople.map((group) => (
          <View key={group.key} style={localStyles.groupCard}>
            <View style={localStyles.groupHeader}>
              <View>
                <Text style={localStyles.groupTitle}>{group.label}</Text>
                <Text style={localStyles.groupMeta}>
                  {group.people.length} {group.people.length === 1 ? "person" : "people"}
                </Text>
              </View>
            </View>

            {group.people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                currentUser={user}
                onStartMessage={onStartMessage}
              />
            ))}
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No people found</Text>
          <Text style={styles.emptyText}>
            Try a different name, email, position, or store.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function PersonRow({ person, currentUser, onStartMessage }) {
  const canMessage = person.id !== currentUser.id;

  return (
    <View style={localStyles.personRow}>
      <UserAvatar user={person} size={44} />

      <View style={localStyles.personMain}>
        <Text style={localStyles.personName}>{person.name}</Text>
        <Text style={localStyles.personMeta}>
          {formatRole(person.role)} · {getStoreLabel(person)}
        </Text>
        {person.email ? (
          <Text style={localStyles.personEmail}>{person.email}</Text>
        ) : null}
      </View>

      {canMessage && (
        <TouchableOpacity
          style={localStyles.messageButton}
          onPress={() => onStartMessage(person)}
        >
          <Text style={localStyles.messageButtonText}>Message</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function sortPeople(a, b) {
  const storeA = getStoreLabel(a);
  const storeB = getStoreLabel(b);

  if (storeA !== storeB) {
    return storeA.localeCompare(storeB);
  }

  const roleA = roleOrder[formatRole(a.role)] || 99;
  const roleB = roleOrder[formatRole(b.role)] || 99;

  if (roleA !== roleB) {
    return roleA - roleB;
  }

  return a.name.localeCompare(b.name);
}

function formatRole(role) {
  return roleLabels[role] || role || "Team Member";
}

function getStoreKey(person) {
  if (person.store) return String(person.store);
  if (person.store_name) return String(person.store_name).replace("Store ", "");
  if (person.storeGroupId?.startsWith("store-")) {
    return person.storeGroupId.replace("store-", "");
  }

  return "company";
}

function getStoreLabel(person) {
  const key = getStoreKey(person);

  if (key === "company") {
    return person.area || "Company";
  }

  return person.store_name || `Store ${key}`;
}

const localStyles = StyleSheet.create({
  searchCard: {
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 6,
    color: "#10212b",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  storeFilterRow: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  filterText: {
    color: "#b8c6d6",
    fontSize: 13,
    fontWeight: "900",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 9,
  },
  summaryNumber: {
    color: "#10212b",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -1,
  },
  summaryLabel: {
    color: "#6b7c8e",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 3,
  },
  groupCard: {
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  groupHeader: {
    marginBottom: 8,
  },
  groupTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  groupMeta: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 18,
    padding: 12,
    marginTop: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 17,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  personMain: {
    flex: 1,
  },
  personName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 2,
  },
  personMeta: {
    color: "#b8c6d6",
    fontSize: 12,
    fontWeight: "800",
  },
  personEmail: {
    color: "#7f91a5",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  messageButton: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  messageButtonText: {
    color: "#10212b",
    fontSize: 12,
    fontWeight: "900",
  },
});
