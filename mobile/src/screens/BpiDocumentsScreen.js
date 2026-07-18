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

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime
      ? {
          hour: "numeric",
          minute: "2-digit",
        }
      : {}),
  });
}

function DocumentRow({ document, onOpen }) {
  const acknowledged = document.status === "acknowledged";

  return (
    <TouchableOpacity
      style={localStyles.documentRow}
      onPress={() => onOpen(document)}
      activeOpacity={0.82}
    >
      <View style={localStyles.documentMain}>
        <View style={localStyles.documentHeader}>
          <Text style={localStyles.documentTitle}>
            {document.title}
          </Text>

          <View
            style={[
              localStyles.statusPill,
              acknowledged
                ? localStyles.statusComplete
                : localStyles.statusPending,
            ]}
          >
            <Text
              style={[
                localStyles.statusText,
                acknowledged
                  ? localStyles.statusCompleteText
                  : localStyles.statusPendingText,
              ]}
            >
              {acknowledged ? "SIGNED" : "ACTION REQUIRED"}
            </Text>
          </View>
        </View>

        {document.description ? (
          <Text style={localStyles.documentDescription}>
            {document.description}
          </Text>
        ) : null}

        <View style={localStyles.metaRow}>
          <Text style={localStyles.metaText}>
            Assigned {formatDate(document.assigned_at)}
          </Text>

          {document.due_date && !acknowledged ? (
            <Text style={localStyles.dueText}>
              Due {formatDate(document.due_date)}
            </Text>
          ) : null}

          {acknowledged ? (
            <Text style={localStyles.signedText}>
              Signed {formatDate(document.acknowledged_at)}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={localStyles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export function BpiDocumentsScreen({
  user,
  apiToken,
  onBack,
}) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [acknowledgedName, setAcknowledgedName] = useState(
    user?.name || ""
  );
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const pendingDocuments = useMemo(
    () =>
      documents.filter(
        (document) => document.status !== "acknowledged"
      ),
    [documents]
  );

  const completedDocuments = useMemo(
    () =>
      documents.filter(
        (document) => document.status === "acknowledged"
      ),
    [documents]
  );

  async function loadDocuments({ quiet = false } = {}) {
    if (!apiToken) {
      setErrorMessage(
        "Your saved session is from an older version of Connect. Please sign out and sign back in."
      );
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!quiet) {
      setLoading(true);
    }

    setErrorMessage("");

    try {
      const nextDocuments = await fetchApiHrDocuments(apiToken);
      setDocuments(nextDocuments);
    } catch (error) {
      setErrorMessage(
        error.message || "Documents could not be loaded."
      );
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
      Alert.alert(
        "Name required",
        "Please type your full name."
      );
      return;
    }

    if (!confirmed) {
      Alert.alert(
        "Confirmation required",
        "Please check the acknowledgement box."
      );
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

      setDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.recipient_id ===
          selectedDocument.recipient_id
            ? {
                ...document,
                status: "acknowledged",
                acknowledged_name:
                  recipient.acknowledged_name || cleanName,
                acknowledged_at:
                  recipient.acknowledged_at ||
                  new Date().toISOString(),
              }
            : document
        )
      );

      setSelectedDocument((currentDocument) => ({
        ...currentDocument,
        status: "acknowledged",
        acknowledged_name:
          recipient.acknowledged_name || cleanName,
        acknowledged_at:
          recipient.acknowledged_at ||
          new Date().toISOString(),
      }));

      setConfirmed(false);

      Alert.alert(
        "Document signed",
        "Your acknowledgement was recorded successfully."
      );
    } catch (error) {
      Alert.alert(
        "Could not sign document",
        error.message || "Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={localStyles.screen}>
      <View style={localStyles.header}>
        <TouchableOpacity
          style={localStyles.backButton}
          onPress={onBack}
        >
          <Text style={localStyles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={localStyles.headerMain}>
          <Text style={localStyles.eyebrow}>BPI DOCUMENTS</Text>
          <Text style={localStyles.headerTitle}>
            My documents
          </Text>
          <Text style={localStyles.headerSubtitle}>
            Review and sign assigned HR documents
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={localStyles.centerState}>
          <ActivityIndicator size="large" color="#e91f3f" />
          <Text style={localStyles.centerTitle}>
            Loading documents
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={localStyles.content}
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
          <View style={localStyles.summaryRow}>
            <View style={localStyles.summaryCard}>
              <Text style={localStyles.summaryValue}>
                {pendingDocuments.length}
              </Text>
              <Text style={localStyles.summaryLabel}>
                Action required
              </Text>
            </View>

            <View style={localStyles.summaryCard}>
              <Text style={localStyles.summaryValue}>
                {completedDocuments.length}
              </Text>
              <Text style={localStyles.summaryLabel}>
                Completed
              </Text>
            </View>
          </View>

          {errorMessage ? (
            <View style={localStyles.errorBox}>
              <Text style={localStyles.errorTitle}>
                Documents unavailable
              </Text>
              <Text style={localStyles.errorText}>
                {errorMessage}
              </Text>

              <TouchableOpacity
                style={localStyles.retryButton}
                onPress={() => loadDocuments()}
              >
                <Text style={localStyles.retryText}>
                  Try Again
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={localStyles.sectionCard}>
            <Text style={localStyles.sectionTitle}>
              Action required
            </Text>

            {pendingDocuments.length ? (
              pendingDocuments.map((document) => (
                <DocumentRow
                  key={document.recipient_id}
                  document={document}
                  onOpen={openDocument}
                />
              ))
            ) : (
              <Text style={localStyles.emptyText}>
                You have no documents waiting for your signature.
              </Text>
            )}
          </View>

          <View style={localStyles.sectionCard}>
            <Text style={localStyles.sectionTitle}>
              Completed
            </Text>

            {completedDocuments.length ? (
              completedDocuments.map((document) => (
                <DocumentRow
                  key={document.recipient_id}
                  document={document}
                  onOpen={openDocument}
                />
              ))
            ) : (
              <Text style={localStyles.emptyText}>
                Signed documents will appear here.
              </Text>
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
          <SafeAreaView style={localStyles.viewerScreen}>
            <View style={localStyles.viewerHeader}>
              <TouchableOpacity
                style={localStyles.viewerClose}
                onPress={closeDocument}
              >
                <Text style={localStyles.viewerCloseText}>
                  Close
                </Text>
              </TouchableOpacity>

              <View style={localStyles.viewerHeaderMain}>
                <Text
                  style={localStyles.viewerTitle}
                  numberOfLines={1}
                >
                  {selectedDocument.title}
                </Text>

                <Text style={localStyles.viewerMeta}>
                  {selectedDocument.original_filename}
                </Text>
              </View>
            </View>

            <View style={localStyles.webViewWrap}>
              <WebView
                source={{
                  uri: getApiHrDocumentFileUrl(
                    selectedDocument.recipient_id
                  ),
                  headers: {
                    Authorization: `Bearer ${apiToken}`,
                  },
                }}
                style={localStyles.webView}
                startInLoadingState
                renderLoading={() => (
                  <View style={localStyles.webViewLoading}>
                    <ActivityIndicator
                      size="large"
                      color="#e91f3f"
                    />
                    <Text style={localStyles.loadingText}>
                      Opening document...
                    </Text>
                  </View>
                )}
                onHttpError={(event) => {
                  console.warn(
                    "Document viewer HTTP error",
                    event.nativeEvent.statusCode
                  );
                }}
              />
            </View>

            {selectedDocument.status === "acknowledged" ? (
              <View style={localStyles.completedPanel}>
                <Text style={localStyles.completedTitle}>
                  ✓ Acknowledged
                </Text>
                <Text style={localStyles.completedText}>
                  Signed by{" "}
                  {selectedDocument.acknowledged_name || user.name}
                  {" on "}
                  {formatDate(
                    selectedDocument.acknowledged_at,
                    true
                  )}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={localStyles.signPanel}
                contentContainerStyle={
                  localStyles.signPanelContent
                }
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  style={localStyles.confirmRow}
                  onPress={() =>
                    setConfirmed((current) => !current)
                  }
                >
                  <View
                    style={[
                      localStyles.checkbox,
                      confirmed && localStyles.checkboxChecked,
                    ]}
                  >
                    {confirmed ? (
                      <Text style={localStyles.checkboxMark}>
                        ✓
                      </Text>
                    ) : null}
                  </View>

                  <Text style={localStyles.confirmText}>
                    I acknowledge that I have received,
                    reviewed, and understand this document.
                  </Text>
                </Pressable>

                <Text style={localStyles.inputLabel}>
                  Full name
                </Text>

                <TextInput
                  style={localStyles.nameInput}
                  value={acknowledgedName}
                  onChangeText={setAcknowledgedName}
                  placeholder="Type your full name"
                  placeholderTextColor="#8797a8"
                  autoCapitalize="words"
                />

                <TouchableOpacity
                  style={[
                    localStyles.signButton,
                    submitting &&
                      localStyles.signButtonDisabled,
                  ]}
                  onPress={submitAcknowledgement}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={localStyles.signButtonText}>
                      Acknowledge & Sign
                    </Text>
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

const localStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07111d",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#132235",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "500",
  },
  headerMain: {
    flex: 1,
  },
  eyebrow: {
    color: "#e91f3f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 2,
  },
  headerSubtitle: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 120,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  summaryValue: {
    color: "#ffffff",
    fontSize: 31,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "#9cadbf",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  documentRow: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 16,
    padding: 12,
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  documentMain: {
    flex: 1,
  },
  documentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  documentTitle: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  documentDescription: {
    color: "#a8b6c5",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 6,
  },
  metaRow: {
    marginTop: 8,
    gap: 2,
  },
  metaText: {
    color: "#8495a7",
    fontSize: 11,
    fontWeight: "700",
  },
  dueText: {
    color: "#ffb4bf",
    fontSize: 11,
    fontWeight: "900",
  },
  signedText: {
    color: "#87d9ab",
    fontSize: 11,
    fontWeight: "900",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: "#ffe4e8",
  },
  statusComplete: {
    backgroundColor: "#dff7e9",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
  },
  statusPendingText: {
    color: "#991b2f",
  },
  statusCompleteText: {
    color: "#166534",
  },
  chevron: {
    color: "#9cadbf",
    fontSize: 24,
    marginLeft: 8,
  },
  emptyText: {
    color: "#9cadbf",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    paddingVertical: 12,
  },
  errorBox: {
    backgroundColor: "#3b1620",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#7f1d31",
  },
  errorTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  errorText: {
    color: "#ffc5cd",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 5,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 10,
  },
  retryText: {
    color: "#991b2f",
    fontSize: 12,
    fontWeight: "900",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  centerTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 14,
  },
  viewerScreen: {
    flex: 1,
    backgroundColor: "#07111d",
  },
  viewerHeader: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#101d2d",
  },
  viewerClose: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  viewerCloseText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  viewerHeaderMain: {
    flex: 1,
  },
  viewerTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  viewerMeta: {
    color: "#9cadbf",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  webViewWrap: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webViewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    color: "#526273",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },
  signPanel: {
    maxHeight: 280,
    backgroundColor: "#101d2d",
  },
  signPanelContent: {
    padding: 14,
    paddingBottom: 24,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#728397",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  checkboxMark: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  confirmText: {
    flex: 1,
    color: "#d8e0e8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  inputLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: "#ffffff",
    color: "#10212b",
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "800",
  },
  signButton: {
    backgroundColor: "#e91f3f",
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  signButtonDisabled: {
    opacity: 0.55,
  },
  signButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  completedPanel: {
    backgroundColor: "#123326",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#24583f",
  },
  completedTitle: {
    color: "#9af0bd",
    fontSize: 16,
    fontWeight: "900",
  },
  completedText: {
    color: "#d2f5df",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
});
