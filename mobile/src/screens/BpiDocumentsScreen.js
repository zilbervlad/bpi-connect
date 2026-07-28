import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

import {
  acknowledgeApiHrDocument,
  fetchApiHrDocuments,
  getApiHrDocumentFileUrl,
} from "../api/client";

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function kindLabel(document) {
  if (document.document_kind === "dwp") return "DWP";
  if (document.document_kind === "hr_form") return "HR FORM";
  return "HR DOCUMENT";
}

function DocumentRow({ document, onOpen }) {
  const acknowledged = document.status === "acknowledged";
  return (
    <TouchableOpacity
      style={styles.documentRow}
      onPress={() => onOpen(document)}
      activeOpacity={0.82}
    >
      <View style={styles.documentMain}>
        <View style={styles.topLine}>
          <Text style={styles.kind}>{kindLabel(document)}</Text>
          <View style={[styles.pill, acknowledged ? styles.completePill : styles.pendingPill]}>
            <Text style={[styles.pillText, acknowledged ? styles.completeText : styles.pendingText]}>
              {acknowledged ? "COMPLETED" : "ACTION REQUIRED"}
            </Text>
          </View>
        </View>
        <Text style={styles.documentTitle}>{document.title}</Text>
        {document.description ? <Text style={styles.description}>{document.description}</Text> : null}
        <Text style={styles.meta}>
          {acknowledged
            ? `Completed ${formatDate(document.acknowledged_at || document.assigned_at)}`
            : `Received ${formatDate(document.assigned_at)}`}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export function BpiDocumentsScreen({ user, apiToken, onBack }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [acknowledgedName, setAcknowledgedName] = useState(user?.name || "");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const pendingDocuments = useMemo(
    () => documents.filter((document) => document.status !== "acknowledged"),
    [documents]
  );
  const completedDocuments = useMemo(
    () => documents.filter((document) => document.status === "acknowledged"),
    [documents]
  );

  async function loadDocuments({ quiet = false } = {}) {
    if (!apiToken) {
      setErrorMessage("Please sign out and sign back in to refresh your Connect session.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!quiet) setLoading(true);
    setErrorMessage("");
    try {
      setDocuments(await fetchApiHrDocuments(apiToken));
    } catch (error) {
      setErrorMessage(error.message || "HR documents could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [apiToken]);

  function openDocument(document) {
    setSelectedDocument(document);
    setAcknowledgedName(user?.name || "");
    setConfirmed(false);
  }

  function closeDocument() {
    if (submitting) return;
    setSelectedDocument(null);
    setConfirmed(false);
  }

  async function submitAcknowledgement() {
    const cleanName = acknowledgedName.trim();
    if (!cleanName) {
      Alert.alert("Name required", "Please type your full name.");
      return;
    }
    if (!confirmed) {
      Alert.alert("Confirmation required", "Please check the acknowledgement box.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await acknowledgeApiHrDocument(
        selectedDocument.recipient_id,
        apiToken,
        cleanName
      );
      const recipient = result.recipient || {};
      const completed = {
        ...selectedDocument,
        status: "acknowledged",
        acknowledged_name: recipient.acknowledged_name || cleanName,
        acknowledged_at: recipient.acknowledged_at || new Date().toISOString(),
      };
      setDocuments((current) =>
        current.map((item) =>
          item.recipient_id === selectedDocument.recipient_id ? completed : item
        )
      );
      setSelectedDocument(completed);
      setConfirmed(false);
      Alert.alert("Completed", "Your acknowledgement was recorded in BPI Ops.");
    } catch (error) {
      Alert.alert("Could not acknowledge", error.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerMain}>
          <Text style={styles.eyebrow}>BPI OPS</Text>
          <Text style={styles.headerTitle}>HR Documents</Text>
          <Text style={styles.headerSubtitle}>HR documents, forms, and DWP records</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#e91f3f" />
          <Text style={styles.centerTitle}>Loading HR records</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadDocuments({ quiet: true });
              }}
            />
          }
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{pendingDocuments.length}</Text>
              <Text style={styles.summaryLabel}>Action required</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{completedDocuments.length}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>HR documents unavailable</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadDocuments()}>
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Action required</Text>
            {pendingDocuments.length ? (
              pendingDocuments.map((document) => (
                <DocumentRow
                  key={String(document.recipient_id)}
                  document={document}
                  onOpen={openDocument}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>Nothing is waiting for your acknowledgement.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Completed & records</Text>
            {completedDocuments.length ? (
              completedDocuments.map((document) => (
                <DocumentRow
                  key={String(document.recipient_id)}
                  document={document}
                  onOpen={openDocument}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>Completed records will appear here.</Text>
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={Boolean(selectedDocument)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDocument}
      >
        {selectedDocument ? (
          <SafeAreaView style={styles.viewerScreen}>
            <View style={styles.viewerHeader}>
              <TouchableOpacity style={styles.closeButton} onPress={closeDocument}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
              <View style={styles.viewerHeaderMain}>
                <Text style={styles.viewerKind}>{kindLabel(selectedDocument)}</Text>
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {selectedDocument.title}
                </Text>
              </View>
            </View>

            <View style={styles.webViewWrap}>
              <WebView
                source={{
                  uri: getApiHrDocumentFileUrl(selectedDocument.recipient_id),
                  headers: { Authorization: `Bearer ${apiToken}` },
                }}
                style={styles.webView}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.webLoading}>
                    <ActivityIndicator size="large" color="#e91f3f" />
                    <Text style={styles.loadingText}>Opening record...</Text>
                  </View>
                )}
              />
            </View>

            {selectedDocument.status === "acknowledged" ? (
              <View style={styles.completedPanel}>
                <Text style={styles.completedTitle}>✓ Completed</Text>
                <Text style={styles.completedBody}>
                  {selectedDocument.acknowledged_name
                    ? `Acknowledged by ${selectedDocument.acknowledged_name} on ${formatDate(selectedDocument.acknowledged_at, true)}`
                    : "This record does not require additional action."}
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.signPanel} keyboardShouldPersistTaps="handled">
                <Pressable style={styles.confirmRow} onPress={() => setConfirmed((value) => !value)}>
                  <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
                    <Text style={styles.checkmark}>{confirmed ? "✓" : ""}</Text>
                  </View>
                  <Text style={styles.confirmText}>
                    I have reviewed this record and acknowledge its contents and any notices shown in the attached PDF.
                  </Text>
                </Pressable>
                <TextInput
                  style={styles.nameInput}
                  value={acknowledgedName}
                  onChangeText={setAcknowledgedName}
                  placeholder="Type your full name"
                  autoCapitalize="words"
                />
                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.disabledButton]}
                  onPress={submitAcknowledgement}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitText}>Acknowledge in BPI Ops</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f6fa" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9", marginRight: 12 },
  backText: { fontSize: 34, lineHeight: 36, color: "#111827" },
  headerMain: { flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: "900", color: "#e91f3f" },
  headerTitle: { fontSize: 26, fontWeight: "900", color: "#111827", marginTop: 2 },
  headerSubtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  content: { padding: 16, paddingBottom: 50 },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  summaryValue: { fontSize: 30, fontWeight: "900", color: "#111827" },
  summaryLabel: { fontSize: 12, color: "#64748b", fontWeight: "800", marginTop: 3 },
  sectionCard: { backgroundColor: "#fff", borderRadius: 20, padding: 15, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "900", color: "#111827", marginBottom: 8 },
  documentRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#eef2f7" },
  documentMain: { flex: 1 },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kind: { fontSize: 10, letterSpacing: 1.2, fontWeight: "900", color: "#64748b" },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  pendingPill: { backgroundColor: "#fff1f2" },
  completePill: { backgroundColor: "#ecfdf5" },
  pillText: { fontSize: 9, fontWeight: "900" },
  pendingText: { color: "#be123c" },
  completeText: { color: "#047857" },
  documentTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginTop: 6 },
  description: { fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 18 },
  meta: { fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: "700" },
  chevron: { fontSize: 30, color: "#94a3b8", marginLeft: 10 },
  emptyText: { color: "#64748b", paddingVertical: 18, textAlign: "center" },
  errorBox: { backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3", borderRadius: 16, padding: 15, marginBottom: 14 },
  errorTitle: { fontWeight: "900", color: "#9f1239", fontSize: 15 },
  errorText: { color: "#9f1239", marginTop: 5 },
  retryButton: { alignSelf: "flex-start", backgroundColor: "#9f1239", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  retryText: { color: "#fff", fontWeight: "900" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centerTitle: { color: "#475569", fontWeight: "800" },
  viewerScreen: { flex: 1, backgroundColor: "#fff" },
  viewerHeader: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  closeButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: "#f1f5f9", marginRight: 12 },
  closeText: { fontWeight: "900", color: "#111827" },
  viewerHeaderMain: { flex: 1 },
  viewerKind: { fontSize: 9, letterSpacing: 1.2, fontWeight: "900", color: "#e91f3f" },
  viewerTitle: { fontSize: 17, fontWeight: "900", color: "#111827", marginTop: 2 },
  webViewWrap: { flex: 1, backgroundColor: "#e5e7eb" },
  webView: { flex: 1 },
  webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  loadingText: { marginTop: 10, color: "#64748b", fontWeight: "800" },
  completedPanel: { padding: 18, borderTopWidth: 1, borderTopColor: "#e5e7eb", backgroundColor: "#ecfdf5" },
  completedTitle: { fontSize: 17, fontWeight: "900", color: "#047857" },
  completedBody: { color: "#065f46", marginTop: 5, lineHeight: 19 },
  signPanel: { maxHeight: 260, borderTopWidth: 1, borderTopColor: "#e5e7eb", padding: 17 },
  confirmRow: { flexDirection: "row", alignItems: "flex-start" },
  checkbox: { width: 25, height: 25, borderRadius: 7, borderWidth: 2, borderColor: "#94a3b8", marginRight: 11, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#e91f3f", borderColor: "#e91f3f" },
  checkmark: { color: "#fff", fontWeight: "900" },
  confirmText: { flex: 1, color: "#334155", lineHeight: 20 },
  nameInput: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, color: "#111827", marginTop: 14 },
  submitButton: { backgroundColor: "#e91f3f", borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 13, marginBottom: 12 },
  disabledButton: { opacity: 0.55 },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
