import { useState } from "react";
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
import { createInviteApiUser } from "../api/client";

const roles = [
  { label: "TM", value: "tm" },
  { label: "Manager", value: "manager" },
  { label: "General Manager", value: "general_manager" },
  { label: "Coach", value: "coach" },
  { label: "HR", value: "hr" },
  { label: "Admin", value: "admin" },
];

const stores = ["3001", "3209"];
const areas = ["North Area", "Company"];

export function AdminScreen({ user }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tm");
  const [storeNumber, setStoreNumber] = useState("3001");
  const [area, setArea] = useState("North Area");
  const [isSaving, setIsSaving] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const canInvite = ["Admin", "HR"].includes(user.role);

  async function handleCreateInvite() {
    setErrorMessage("");
    setCreatedInvite(null);

    if (!name.trim() || !email.trim() || !role) {
      setErrorMessage("Name, email, and role are required.");
      return;
    }

    setIsSaving(true);

    try {
      const invite = await createInviteApiUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        storeNumber: shouldShowStore(role) ? storeNumber : "",
        area,
      });

      setCreatedInvite(invite);
      setName("");
      setEmail("");
      setRole("tm");
      setStoreNumber("3001");
      setArea("North Area");
    } catch (error) {
      setErrorMessage(error.message || "Could not create invite.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!canInvite) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <HeaderBlock
          eyebrow="ADMIN"
          title="Access denied"
          subtitle="Only Admin and HR accounts can add people."
        />

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>You do not have access</Text>
          <Text style={styles.emptyText}>
            Ask an Admin or HR user to create or manage user invites.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="ADMIN"
        title="Add person"
        subtitle="Create an invite-only account and assign role, store, and area."
      />

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Employee name"
          placeholderTextColor="#7b8da0"
          style={localStyles.input}
        />

        <Text style={localStyles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="name@bostonpie.com"
          placeholderTextColor="#7b8da0"
          style={localStyles.input}
        />

        <Text style={localStyles.label}>Role</Text>
        <View style={localStyles.optionGrid}>
          {roles.map((item) => {
            const isActive = role === item.value;

            return (
              <TouchableOpacity
                key={item.value}
                style={[localStyles.optionChip, isActive && localStyles.optionChipActive]}
                onPress={() => setRole(item.value)}
              >
                <Text style={[localStyles.optionText, isActive && localStyles.optionTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {shouldShowStore(role) && (
          <>
            <Text style={localStyles.label}>Store</Text>
            <View style={localStyles.optionGrid}>
              {stores.map((store) => {
                const isActive = storeNumber === store;

                return (
                  <TouchableOpacity
                    key={store}
                    style={[localStyles.optionChip, isActive && localStyles.optionChipActive]}
                    onPress={() => setStoreNumber(store)}
                  >
                    <Text style={[localStyles.optionText, isActive && localStyles.optionTextActive]}>
                      Store {store}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={localStyles.label}>Area</Text>
        <View style={localStyles.optionGrid}>
          {areas.map((item) => {
            const isActive = area === item;

            return (
              <TouchableOpacity
                key={item}
                style={[localStyles.optionChip, isActive && localStyles.optionChipActive]}
                onPress={() => setArea(item)}
              >
                <Text style={[localStyles.optionText, isActive && localStyles.optionTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {errorMessage ? (
          <View style={localStyles.errorBox}>
            <Text style={localStyles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, isSaving && localStyles.disabledButton]}
          onPress={handleCreateInvite}
          disabled={isSaving}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? "Creating Invite..." : "Create Invite"}
          </Text>
        </TouchableOpacity>
      </View>

      {createdInvite && (
        <View style={localStyles.inviteCard}>
          <Text style={localStyles.inviteTitle}>Invite created</Text>
          <Text style={localStyles.inviteText}>
            Send this invite link to the employee so they can set their password.
          </Text>

          <View style={localStyles.inviteUrlBox}>
            <Text style={localStyles.inviteUrl}>{createdInvite.invite_url}</Text>
          </View>

          <Text style={localStyles.inviteMeta}>
            User: {createdInvite.user.name} · {createdInvite.user.role}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function shouldShowStore(role) {
  return ["tm", "manager", "general_manager"].includes(role);
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "#101d2d",
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: "#07111f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 16,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  optionChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  optionChipActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  optionText: {
    color: "#b8c6d6",
    fontSize: 13,
    fontWeight: "900",
  },
  optionTextActive: {
    color: "#ffffff",
  },
  errorBox: {
    backgroundColor: "#ffe4e8",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#991b2f",
    fontSize: 13,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  inviteCard: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 20,
    marginBottom: 20,
  },
  inviteTitle: {
    color: "#10212b",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  inviteText: {
    color: "#526273",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
    fontWeight: "700",
  },
  inviteUrlBox: {
    backgroundColor: "#eef5f8",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  inviteUrl: {
    color: "#10212b",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  inviteMeta: {
    color: "#697b8d",
    fontSize: 12,
    fontWeight: "800",
  },
});
