import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, FileSpreadsheet, Calendar, Users, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ExportSection() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [pdfSections, setPdfSections] = useState({
    summary: true,
    profile: true,
    symptoms: true,
    "ai-interactions": true
  });
  const { toast } = useToast();

  const csvEntities = [
    { id: "symptoms", label: "Symptom Logs", icon: Calendar, description: "Your symptom tracking data" },
    { id: "ai-interactions", label: "AI Conversations", icon: Brain, description: "Your interactions with Zebby" },
    { id: "profile", label: "Profile Data", icon: Users, description: "Your account information" }
  ] as const;

  const pdfSectionOptions = [
    { id: "summary", label: "Summary Overview", description: "High-level statistics and overview" },
    { id: "profile", label: "Profile Information", description: "Your account and subscription details" },
    { id: "symptoms", label: "Symptom Logs", description: "Detailed symptom tracking data" },
    { id: "ai-interactions", label: "AI Conversations", description: "Your conversations with Zebby" }
  ] as const;

  const downloadCsv = async (entity: string) => {
    try {
      setIsExporting(true);
      const url = new URL(`/api/export/csv/${entity}`, window.location.origin);
      if (fromDate) url.searchParams.set("from", new Date(fromDate).toISOString());
      if (toDate) url.searchParams.set("to", new Date(toDate).toISOString());
      
      const response = await fetch(url.toString(), {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Get filename from Content-Disposition header or create a default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `zebby_${entity}_${new Date().toISOString().slice(0, 10)}.csv`;
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({
        title: "Export Successful",
        description: `Your ${entity} data has been downloaded as CSV.`
      });
    } catch (error) {
      console.error("CSV export error:", error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting your data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadPdf = async () => {
    try {
      setIsExporting(true);
      const selectedSections = Object.entries(pdfSections)
        .filter(([_, selected]) => selected)
        .map(([section]) => section);
      
      if (selectedSections.length === 0) {
        toast({
          title: "No Sections Selected",
          description: "Please select at least one section to include in your PDF report.",
          variant: "destructive"
        });
        return;
      }
      
      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          from: fromDate || undefined,
          to: toDate || undefined,
          sections: selectedSections
        })
      });
      
      if (!response.ok) {
        if (response.status === 402) {
          const errorData = await response.json();
          toast({
            title: "Upgrade Required",
            description: errorData.message || "PDF exports are available with Zebby Plus subscription only.",
            variant: "destructive"
          });
          return;
        }
        throw new Error(`PDF export failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Get filename from Content-Disposition header or create a default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `zebby_report_${new Date().toISOString().slice(0, 10)}.pdf`;
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({
        title: "PDF Generated",
        description: "Your health report has been downloaded successfully."
      });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({
        title: "Export Failed",
        description: "There was an error generating your PDF report. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range Filter
          </CardTitle>
          <CardDescription>
            Optional: Filter your exported data by date range
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-date">From Date</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                data-testid="input-from-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">To Date</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                data-testid="input-to-date"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CSV Exports */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            CSV Data Export
          </CardTitle>
          <CardDescription>
            Download your data in spreadsheet format for analysis or backup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {csvEntities.map((entity) => {
            const Icon = entity.icon;
            return (
              <div key={entity.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{entity.label}</p>
                    <p className="text-sm text-muted-foreground">{entity.description}</p>
                  </div>
                </div>
                <Button
                  onClick={() => downloadCsv(entity.id)}
                  disabled={isExporting}
                  variant="outline"
                  size="sm"
                  data-testid={`button-csv-${entity.id}`}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Separator />

      {/* PDF Report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Comprehensive PDF Report
          </CardTitle>
          <CardDescription>
            Generate a formatted report for healthcare providers or personal records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Label className="text-base font-medium">Include in Report:</Label>
            {pdfSectionOptions.map((section) => (
              <div key={section.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`section-${section.id}`}
                  checked={pdfSections[section.id as keyof typeof pdfSections]}
                  onCheckedChange={(checked) => 
                    setPdfSections(prev => ({ ...prev, [section.id]: checked }))
                  }
                  data-testid={`checkbox-section-${section.id}`}
                />
                <div className="space-y-1">
                  <Label htmlFor={`section-${section.id}`} className="cursor-pointer">
                    {section.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
              </div>
            ))}
          </div>
          
          <Button 
            onClick={downloadPdf}
            disabled={isExporting}
            className="w-full"
            data-testid="button-generate-pdf"
          >
            <FileText className="h-4 w-4 mr-2" />
            {isExporting ? "Generating..." : "Generate PDF Report"}
          </Button>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg space-y-2">
        <div>
          <strong>Privacy & Medical Disclaimer:</strong>
        </div>
        <ul className="space-y-1 list-disc list-inside">
          <li>Your exports are private to you. Zebby never gives medical advice.</li>
          <li>Share with clinicians at your discretion.</li>
          <li>All exported data is informational only and should not be considered medical advice.</li>
          <li>These reports help healthcare providers understand your symptom patterns and health journey.</li>
        </ul>
      </div>
    </div>
  );
}