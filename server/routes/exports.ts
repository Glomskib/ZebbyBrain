import { Router } from 'express';
import { db } from '../db';
import { symptomLogs, symptomEntries, sleepLogs, users } from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const router = Router();

const FF_PDF_V2 = (process.env.FF_PDF_V2 || "").toLowerCase() === "true";

const fonts = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts.js',
    bold: 'node_modules/pdfmake/build/vfs_fonts.js',
    italics: 'node_modules/pdfmake/build/vfs_fonts.js',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js'
  }
};

interface InsightCard {
  kind: string;
  severity?: string;
  title: string;
  facts: string[];
  advice?: string;
}

interface InsightsResponse {
  cards: InsightCard[];
}

router.get('/pdf', async (req: any, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const version = req.query.v;
  if (!FF_PDF_V2 || version !== '2') {
    return res.status(400).json({ error: 'PDF v2 not available' });
  }

  res.setHeader('Cache-Control', 'no-store');
  
  try {
    const userId = req.user.id;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const tz = (req.query.tz as string) || 'America/New_York';

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });
    }

    const fromDate = parseISO(from);
    const toDate = parseISO(to);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const initials = [user.firstName?.charAt(0), user.lastName?.charAt(0)]
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'U';

    const entries = await db
      .select()
      .from(symptomEntries)
      .where(
        and(
          eq(symptomEntries.userId, userId),
          gte(symptomEntries.occurredAt, fromDate),
          lte(symptomEntries.occurredAt, toDate)
        )
      )
      .orderBy(desc(symptomEntries.occurredAt));

    const sleepData = await db
      .select()
      .from(sleepLogs)
      .where(
        and(
          eq(sleepLogs.userId, userId),
          gte(sleepLogs.bedtime, fromDate),
          lte(sleepLogs.bedtime, toDate)
        )
      )
      .orderBy(desc(sleepLogs.bedtime));

    let insightsData: InsightsResponse | null = null;
    try {
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      const range = daysDiff <= 10 ? '7d' : daysDiff <= 40 ? '30d' : '90d';
      
      const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/insights/snapshot?range=${range}`, {
        headers: {
          'Cookie': req.headers.cookie || ''
        }
      });
      
      if (response.ok) {
        insightsData = await response.json();
      }
    } catch (err) {
      console.error('PDF: Could not fetch insights', err);
    }

    const docDefinition = buildPdfDocument(
      initials,
      from,
      to,
      tz,
      entries,
      sleepData,
      insightsData
    );

    const printer = new PdfPrinter(fonts as any);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=zebby_report_${from}.pdf`);

    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    return res.status(500).json({ error: 'PDF generation failed' });
  }
});

function buildPdfDocument(
  initials: string,
  from: string,
  to: string,
  tz: string,
  entries: any[],
  sleepData: any[],
  insights: InsightsResponse | null
): TDocumentDefinitions {
  const content: Content = [];

  content.push({
    text: 'Zebby Health Report',
    style: 'header',
    margin: [0, 0, 0, 10]
  });

  content.push({
    text: [
      { text: 'User: ', bold: true },
      initials,
      '\n',
      { text: 'Date Range: ', bold: true },
      `${from} to ${to}`,
      '\n',
      { text: 'Generated: ', bold: true },
      format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    ],
    margin: [0, 0, 0, 20]
  });

  if (insights && insights.cards && insights.cards.length > 0) {
    content.push({
      text: 'Zebby Findings',
      style: 'subheader',
      margin: [0, 0, 0, 10]
    });

    insights.cards.forEach(card => {
      content.push({
        text: card.title,
        bold: true,
        margin: [0, 5, 0, 3]
      });

      if (card.facts && card.facts.length > 0) {
        content.push({
          ul: card.facts,
          margin: [0, 0, 0, 5]
        });
      }

      if (card.advice) {
        content.push({
          text: card.advice,
          italics: true,
          margin: [0, 0, 0, 10]
        });
      }
    });
  }

  content.push({
    text: 'Trends',
    style: 'subheader',
    margin: [0, 10, 0, 10]
  });

  const avgIntensity = entries.length > 0
    ? (entries.reduce((sum, e) => sum + (e.intensity || 0), 0) / entries.length).toFixed(1)
    : 'N/A';

  const avgHeartRate = entries.filter(e => e.heartRateBpm).length > 0
    ? (entries.filter(e => e.heartRateBpm).reduce((sum, e) => sum + e.heartRateBpm, 0) / entries.filter(e => e.heartRateBpm).length).toFixed(0)
    : 'N/A';

  const avgSleep = sleepData.length > 0
    ? (sleepData.reduce((sum, s) => sum + ((s.hoursSlept || 0) + (s.minutesSlept || 0) / 60), 0) / sleepData.length).toFixed(1)
    : 'N/A';

  content.push({
    text: [
      { text: 'Average Pain Intensity: ', bold: true },
      avgIntensity,
      '\n',
      { text: 'Average Heart Rate: ', bold: true },
      avgHeartRate + ' bpm',
      '\n',
      { text: 'Average Sleep: ', bold: true },
      avgSleep + ' hours'
    ],
    margin: [0, 0, 0, 20]
  });

  content.push({
    text: 'Symptom Entries',
    style: 'subheader',
    pageBreak: 'before',
    margin: [0, 0, 0, 10]
  });

  if (entries.length === 0) {
    content.push({
      text: 'No symptom data for the selected range.',
      italics: true,
      color: '#666666'
    });
  } else {
    const groupedByDay: Record<string, any[]> = {};
    
    entries.forEach(entry => {
      const zonedDate = toZonedTime(new Date(entry.occurredAt), tz);
      const dayKey = format(zonedDate, 'yyyy-MM-dd');
      
      if (!groupedByDay[dayKey]) {
        groupedByDay[dayKey] = [];
      }
      groupedByDay[dayKey].push(entry);
    });

    const days = Object.keys(groupedByDay).sort().reverse();
    
    days.forEach(day => {
      content.push({
        text: format(parseISO(day), 'MMMM d, yyyy'),
        bold: true,
        margin: [0, 10, 0, 5]
      });

      const dayEntries = groupedByDay[day];
      
      dayEntries.forEach(entry => {
        const zonedTime = toZonedTime(new Date(entry.occurredAt), tz);
        const timeStr = format(zonedTime, 'HH:mm');
        
        const entryText: any[] = [
          { text: `${timeStr} - `, color: '#666666' },
          { text: entry.symptomName, bold: true },
          { text: ` (Intensity: ${entry.intensity}/10)` }
        ];

        if (entry.bodyPart) {
          entryText.push({ text: ` - ${entry.bodyPart}`, italics: true });
          if (entry.side) {
            entryText.push({ text: ` (${entry.side})`, italics: true });
          }
        }

        content.push({
          text: entryText,
          margin: [10, 2, 0, 2]
        });

        if (entry.notes) {
          content.push({
            text: entry.notes,
            margin: [20, 0, 0, 3],
            color: '#444444',
            fontSize: 9
          });
        }

        if (entry.heartRateBpm) {
          content.push({
            text: `HR: ${entry.heartRateBpm} bpm`,
            margin: [20, 0, 0, 3],
            color: '#666666',
            fontSize: 8
          });
        }

        if (entry.weatherTempC && entry.weatherText) {
          content.push({
            text: `Weather: ${entry.weatherTempC}°C, ${entry.weatherText}`,
            margin: [20, 0, 0, 3],
            color: '#666666',
            fontSize: 8
          });
        }
      });
    });
  }

  return {
    content,
    styles: {
      header: {
        fontSize: 22,
        bold: true
      },
      subheader: {
        fontSize: 16,
        bold: true
      }
    },
    defaultStyle: {
      fontSize: 10
    }
  };
}

export default router;
