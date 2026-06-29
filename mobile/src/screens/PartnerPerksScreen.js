import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";

const partnerPerks = [
  {
    id: "fitness",
    name: "Fitness Partner",
    category: "Health",
    discount: "Special gym pricing for BPI team members.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "car-care",
    name: "Car Care Partner",
    category: "Auto",
    discount: "Discounts on detailing, oil changes, and basic service.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "phone-repair",
    name: "Phone Repair Partner",
    category: "Tech",
    discount: "Team pricing on screen repairs and accessories.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "family-fun",
    name: "Family Fun Partner",
    category: "Local",
    discount: "Deals for family activities and weekend plans.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "travel",
    name: "Travel Partner",
    category: "Travel",
    discount: "Hotel, rental, or travel deals for BPI employees.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "insurance",
    name: "Insurance Partner",
    category: "Money",
    discount: "Preferred quotes or savings for team members.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "tax-help",
    name: "Tax Help Partner",
    category: "Money",
    discount: "Discounted personal tax prep or financial help.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "wellness",
    name: "Wellness Partner",
    category: "Health",
    discount: "Wellness, massage, or recovery offers.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "uniforms",
    name: "Uniforms & Gear",
    category: "Work",
    discount: "Useful team gear and work essentials.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
  {
    id: "local-eats",
    name: "Local Eats Partner",
    category: "Food",
    discount: "Local restaurant or coffee deals for the team.",
    code: "Coming soon",
    contact: "Partner details coming soon",
  },
];

export function PartnerPerksScreen({ onBack }) {
  function openPartner(partner) {
    Alert.alert(
      partner.name,
      `${partner.discount}\n\nCode: ${partner.code}\n${partner.contact}`,
      [{ text: "Close", style: "cancel" }]
    );
  }

  return (
    <View style={localStyles.safe}>
      <StatusBar style="dark" />

      <ScrollView style={localStyles.screen} contentContainerStyle={localStyles.content}>
        <View style={localStyles.header}>
          <TouchableOpacity style={localStyles.backButton} onPress={onBack} activeOpacity={0.85}>
            <Text style={localStyles.backText}>‹</Text>
          </TouchableOpacity>

          <View style={localStyles.headerMain}>
            <Text style={localStyles.eyebrow}>BPI CONNECT</Text>
            <Text style={localStyles.title}>Partner Perks</Text>
            <Text style={localStyles.subtitle}>
              Deals and discounts for BPI team members.
            </Text>
          </View>
        </View>

        <View style={localStyles.featureCard}>
          <Text style={localStyles.featureLabel}>TEAM PERKS</Text>
          <Text style={localStyles.featureTitle}>Save a little outside of work.</Text>
          <Text style={localStyles.featureText}>
            We’re adding local partners with special discounts for the BPI team.
          </Text>
        </View>

        <View style={localStyles.partnerGrid}>
          {partnerPerks.map((partner) => (
            <TouchableOpacity
              key={partner.id}
              style={localStyles.partnerCard}
              onPress={() => openPartner(partner)}
              activeOpacity={0.86}
            >
              <View style={localStyles.partnerTop}>
                <Text style={localStyles.partnerCategory}>{partner.category}</Text>
                <Text style={localStyles.partnerArrow}>›</Text>
              </View>

              <Text style={localStyles.partnerName}>{partner.name}</Text>
              <Text style={localStyles.partnerDiscount} numberOfLines={2}>
                {partner.discount}
              </Text>

              <View style={localStyles.dealPill}>
                <Text style={localStyles.dealPillText}>Show deal</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
});
