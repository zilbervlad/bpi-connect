import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

const BPI_OPS_PERKS_URL = "https://bpi-ops.onrender.com/api/integrations/bpi-ops/perks";

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();

  if (!text || text.toLowerCase() === "none" || text.toLowerCase() === "null") {
    return "";
  }

  return text;
}

function cleanPhone(phoneNumber) {
  return cleanText(phoneNumber).replace(/[^\d+]/g, "");
}

function getPerkSummary(perk) {
  return (
    cleanText(perk.short_description) ||
    cleanText(perk.description) ||
    cleanText(perk.redemption_instructions) ||
    "Exclusive offer for BPI team members."
  );
}

function buildPerkDetails(perk) {
  const parts = [];

  const description = cleanText(perk.description);
  const instructions = cleanText(perk.redemption_instructions);
  const terms = cleanText(perk.terms);
  const phone = cleanText(perk.phone_number);
  const url = cleanText(perk.button_url);

  if (description) {
    parts.push(description);
  }

  if (instructions) {
    parts.push(`How to claim:\n${instructions}`);
  }

  if (terms) {
    parts.push(`Terms:\n${terms}`);
  }

  if (phone) {
    parts.push(`Phone: ${phone}`);
  }

  if (url) {
    parts.push(`Link: ${url}`);
  }

  return parts.join("\n\n") || getPerkSummary(perk);
}

async function recordPerkEvent(perkId, eventType) {
  if (!perkId) {
    return;
  }

  try {
    await fetch(`${BPI_OPS_PERKS_URL}/${perkId}/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: eventType,
        metadata: {
          source: "bpi_connect_mobile",
        },
      }),
    });
  } catch (error) {
    console.log("Could not record perk event:", error.message);
  }
}

export function PartnerPerksScreen({ onBack }) {
  const [perks, setPerks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPerks = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
    }

    setErrorMessage("");

    try {
      const response = await fetch(BPI_OPS_PERKS_URL);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.message || "Could not load BPI Perks.");
      }

      setPerks(Array.isArray(data.perks) ? data.perks : []);
    } catch (error) {
      console.log("Could not load BPI Perks:", error.message);
      setErrorMessage("We couldn’t load perks right now. Pull down to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPerks();
  }, [loadPerks]);

  async function openPerk(perk) {
    await recordPerkEvent(perk.id, "view");

    const buttonUrl = cleanText(perk.button_url);
    const phoneNumber = cleanText(perk.phone_number);

    const buttons = [{ text: "Close", style: "cancel" }];

    if (phoneNumber) {
      buttons.push({
        text: "Call",
        onPress: async () => {
          await recordPerkEvent(perk.id, "call");

          const phone = cleanPhone(phoneNumber);

          if (phone) {
            Linking.openURL(`tel:${phone}`);
          }
        },
      });
    }

    if (buttonUrl) {
      buttons.push({
        text: cleanText(perk.button_text) || "Open Offer",
        onPress: async () => {
          await recordPerkEvent(perk.id, "click");
          Linking.openURL(buttonUrl);
        },
      });
    }

    Alert.alert(
      cleanText(perk.title) || cleanText(perk.partner_name) || "BPI Perk",
      buildPerkDetails(perk),
      buttons
    );
  }

  function onRefresh() {
    setRefreshing(true);
    loadPerks({ quiet: true });
  }

  return (
    <View style={localStyles.safe}>
      <StatusBar style="dark" />

      <ScrollView
        style={localStyles.screen}
        contentContainerStyle={localStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={localStyles.header}>
          <TouchableOpacity style={localStyles.backButton} onPress={onBack} activeOpacity={0.85}>
            <Text style={localStyles.backText}>‹</Text>
          </TouchableOpacity>

          <View style={localStyles.headerMain}>
            <Text style={localStyles.eyebrow}>BPI CONNECT</Text>
            <Text style={localStyles.title}>BPI Perks</Text>
            <Text style={localStyles.subtitle}>
              Discounts and offers for BPI team members.
            </Text>
          </View>
        </View>

        <View style={localStyles.featureCard}>
          <Text style={localStyles.featureLabel}>TEAM PERKS</Text>
          <Text style={localStyles.featureTitle}>Save a little outside of work.</Text>
          <Text style={localStyles.featureText}>
            Exclusive discounts and local deals for the BPI team.
          </Text>
        </View>

        {loading ? (
          <View style={localStyles.stateCard}>
            <ActivityIndicator />
            <Text style={localStyles.stateTitle}>Loading perks…</Text>
          </View>
        ) : errorMessage ? (
          <View style={localStyles.stateCard}>
            <Text style={localStyles.stateTitle}>Couldn’t load perks</Text>
            <Text style={localStyles.stateText}>{errorMessage}</Text>
            <TouchableOpacity style={localStyles.retryButton} onPress={() => loadPerks()} activeOpacity={0.85}>
              <Text style={localStyles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : perks.length === 0 ? (
          <View style={localStyles.stateCard}>
            <Text style={localStyles.stateTitle}>No perks yet</Text>
            <Text style={localStyles.stateText}>
              New partner offers will show here as soon as they’re added in BPI Ops.
            </Text>
          </View>
        ) : (
          <View style={localStyles.partnerGrid}>
            {perks.map((perk) => {
              const title = cleanText(perk.title) || cleanText(perk.partner_name) || "BPI Perk";
              const partnerName = cleanText(perk.partner_name);
              const category = cleanText(perk.category) || "BPI PERK";
              const buttonText = cleanText(perk.button_text) || "Show deal";

              return (
                <TouchableOpacity
                  key={String(perk.id)}
                  style={[
                    localStyles.partnerCard,
                    perk.featured ? localStyles.featuredPartnerCard : null,
                  ]}
                  onPress={() => openPerk(perk)}
                  activeOpacity={0.86}
                >
                  <View style={localStyles.partnerTop}>
                    <Text style={localStyles.partnerCategory}>{category}</Text>
                    <Text style={localStyles.partnerArrow}>›</Text>
                  </View>

                  <Text style={localStyles.partnerName}>{title}</Text>

                  {!!partnerName && partnerName !== title && (
                    <Text style={localStyles.partnerCompany}>{partnerName}</Text>
                  )}

                  <Text style={localStyles.partnerDiscount} numberOfLines={2}>
                    {getPerkSummary(perk)}
                  </Text>

                  <View style={localStyles.dealPill}>
                    <Text style={localStyles.dealPillText}>{buttonText}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const localStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f3f5f9",
  },
  screen: {
    flex: 1,
  },
  content: {
    padding: 14,
    paddingBottom: 118,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  backText: {
    color: "#10212b",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "700",
    marginTop: -2,
  },
  headerMain: {
    flex: 1,
  },
  eyebrow: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 3,
  },
  title: {
    color: "#10212b",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "#617386",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 3,
  },
  featureCard: {
    backgroundColor: "#111827",
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  featureLabel: {
    color: "#fbbf24",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  featureTitle: {
    color: "#ffffff",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  featureText: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  partnerGrid: {
    gap: 10,
  },
  partnerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#e7edf4",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  featuredPartnerCard: {
    borderColor: "#fbbf24",
    borderWidth: 1.5,
  },
  partnerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  partnerCategory: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  partnerArrow: {
    color: "#94a3b8",
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 24,
  },
  partnerName: {
    color: "#10212b",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  partnerCompany: {
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    marginTop: 3,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  partnerDiscount: {
    color: "#617386",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 5,
  },
  dealPill: {
    alignSelf: "flex-start",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginTop: 12,
  },
  dealPillText: {
    color: "#10212b",
    fontSize: 11,
    fontWeight: "900",
  },
  stateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e7edf4",
    alignItems: "center",
    gap: 8,
  },
  stateTitle: {
    color: "#10212b",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  stateText: {
    color: "#617386",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#10212b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 6,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
});
