import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { getVisiblePrivateRecipients } from "../data/privateRecipients";

export function PeopleScreen({ user, onStartMessage }) {
  const people = getVisiblePrivateRecipients(user);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="PEOPLE"
        title="Directory"
        subtitle={`${user.role} view · people and groups you can reach.`}
      />

      <View style={localStyles.summaryCard}>
        <Text style={localStyles.summaryNumber}>{people.length}</Text>
        <Text style={localStyles.summaryLabel}>Visible contacts</Text>
        <Text style={localStyles.summaryText}>
          Access is based on your role, store group, and area assignment.
        </Text>
      </View>

      {people.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No contacts available</Text>
          <Text style={styles.emptyText}>
            Your role does not currently have visible contacts.
          </Text>
        </View>
      ) : (
        <View style={localStyles.peopleList}>
          {people.map((person) => (
            <View key={person.id} style={localStyles.personCard}>
              <View style={localStyles.avatar}>
                <Text style={localStyles.avatarText}>{person.name.charAt(0)}</Text>
              </View>

              <View style={localStyles.personMain}>
                <Text style={localStyles.personName}>{person.name}</Text>
                <Text style={localStyles.personMeta}>
                  {person.role} · {person.store}
                </Text>
                <Text style={localStyles.personArea}>{person.area}</Text>
              </View>

              <TouchableOpacity
                style={localStyles.messageButton}
                onPress={() => onStartMessage(person)}
              >
                <Text style={localStyles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  summaryCard: {
    backgroundColor: "#101d2d",
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  summaryNumber: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  summaryLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  summaryText: {
    color: "#9cadbf",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    fontWeight: "700",
  },
  peopleList: {
    gap: 10,
  },
  personCard: {
    backgroundColor: "#101d2d",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  personMain: {
    flex: 1,
  },
  personName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 3,
  },
  personMeta: {
    color: "#b8c6d6",
    fontSize: 12,
    fontWeight: "800",
  },
  personArea: {
    color: "#7f91a5",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  messageButton: {
    backgroundColor: "#eef5f8",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  messageButtonText: {
    color: "#163847",
    fontSize: 12,
    fontWeight: "900",
  },
});
