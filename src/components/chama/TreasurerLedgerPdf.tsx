import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatMoney } from "@/lib/vtix-utils";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { marginBottom: 18 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: "#5a6882", marginTop: 4 },
  section: { marginBottom: 14 },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#d9dbe3",
  },
  tableRow: { flexDirection: "row" },
  tableHeader: { backgroundColor: "#f3f4f8" },
  tableCol: {
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#d9dbe3",
    padding: 6,
  },
  footer: { marginTop: 18, textAlign: "right", fontSize: 10, color: "#5a6882" },
});

type LedgerEntry = {
  memberName: string;
  amount: number;
  method?: string;
  reference?: string;
  paidAt?: string;
};

interface TreasurerLedgerPdfProps {
  groupName: string;
  currency: string;
  entries: LedgerEntry[];
}

const TreasurerLedgerPdf = ({ groupName, currency, entries }: TreasurerLedgerPdfProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>ChamaHub Treasurer Ledger</Text>
        <Text style={styles.subtitle}>
          {groupName} • Generated {new Date().toLocaleDateString("en-KE")}
        </Text>
      </View>

      <View style={styles.section}>
        <Text>Total entries: {entries.length}</Text>
      </View>

      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <View style={[styles.tableCol, { width: "30%" }]}>
            <Text>Member</Text>
          </View>
          <View style={[styles.tableCol, { width: "16%" }]}>
            <Text>Amount</Text>
          </View>
          <View style={[styles.tableCol, { width: "16%" }]}>
            <Text>Method</Text>
          </View>
          <View style={[styles.tableCol, { width: "18%" }]}>
            <Text>Date</Text>
          </View>
          <View style={[styles.tableCol, { width: "20%" }]}>
            <Text>Reference</Text>
          </View>
        </View>
        {entries.map((entry, index) => (
          <View key={`${entry.memberName}-${index}`} style={styles.tableRow}>
            <View style={[styles.tableCol, { width: "30%" }]}>
              <Text>{entry.memberName}</Text>
            </View>
            <View style={[styles.tableCol, { width: "16%" }]}>
              <Text>{formatMoney(entry.amount, currency)}</Text>
            </View>
            <View style={[styles.tableCol, { width: "16%" }]}>
              <Text>{entry.method || "manual"}</Text>
            </View>
            <View style={[styles.tableCol, { width: "18%" }]}>
              <Text>
                {entry.paidAt ? new Date(entry.paidAt).toLocaleDateString("en-KE") : "—"}
              </Text>
            </View>
            <View style={[styles.tableCol, { width: "20%" }]}>
              <Text>{entry.reference || "—"}</Text>
            </View>
          </View>
        ))}
        {entries.length === 0 && (
          <View style={styles.tableRow}>
            <View style={[styles.tableCol, { width: "100%" }]}>
              <Text>No contributions recorded yet.</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text>ChamaHub • Treasurer ledger export</Text>
      </View>
    </Page>
  </Document>
);

export default TreasurerLedgerPdf;
