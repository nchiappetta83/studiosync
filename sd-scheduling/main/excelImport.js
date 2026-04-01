/**
 * Excel project importer — reads SD_Schedule.xlsx and syncs projects into the database.
 *
 * Uses exceljs (Node equivalent of openpyxl) for proper cell fill color reading.
 * V4 convention: yellow cell fill in the Active column (B) = active project.
 *
 * Expected Excel structure (both "Current Projects" and "Future Projects" sheets):
 *   Col A: Partner   Col B: Active (yellow fill = active)   Col C: Client   Col D: Project   Col E: Notes
 */

const ExcelJS = require('exceljs');

class ExcelImport {
  constructor(db) {
    this.db = db;
  }

  /**
   * Import projects from an Excel file.
   * @param {string} filePath — path to the .xlsx file
   * @returns {{ imported: number, updated: number, sheets: string[] }}
   */
  async import(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const results = { imported: 0, updated: 0, sheets: [] };

    for (const sheet of workbook.worksheets) {
      const sheetName = sheet.name;
      const rowCount = sheet.rowCount;
      if (rowCount < 2) continue; // Need at least header + 1 data row

      // Detect columns from header row
      const headerRow = sheet.getRow(1);
      const colMap = this._detectColumns(headerRow);
      if (!colMap.client && !colMap.project) continue; // Skip unrecognized sheets

      results.sheets.push(sheetName);

      // Determine category from sheet name
      const isFuture = sheetName.toLowerCase().includes('future');
      const category = isFuture ? 'future' : 'current';

      // Iterate data rows (starting from row 2)
      for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
        const row = sheet.getRow(rowNum);

        const client = String(row.getCell(colMap.client).value || '').trim();
        const projectName = String(row.getCell(colMap.project).value || '').trim();
        const partnerStr = String(row.getCell(colMap.partner).value || '').trim();
        const notes = colMap.notes ? String(row.getCell(colMap.notes).value || '').trim() : '';

        // Skip empty rows
        if (!client && !projectName) continue;

        // Determine active/inactive using cell fill color (V4 convention: yellow = active)
        let status = 'active';
        if (colMap.active) {
          const activeCell = row.getCell(colMap.active);
          const isActive = this._hasYellowFill(activeCell);
          status = isActive ? 'active' : 'inactive';
        }

        // Try to match one or more partners by initials or name
        const partnerInfo = this._resolvePartners(partnerStr);

        // Check if this project already exists (match on client + name)
        const existing = this._findExistingProject(client, projectName);

        if (existing) {
          // Update if anything changed
          const updates = {};
          if (notes && notes !== existing.notes) updates.notes = notes;
          if (partnerInfo.partner_id !== existing.partner_id) updates.partner_id = partnerInfo.partner_id;
          if ((existing.partner_ids || '[]') !== JSON.stringify(partnerInfo.partner_ids)) {
            updates.partner_ids = partnerInfo.partner_ids;
          }
          if ((existing.partner_initials || '') !== partnerInfo.partner_initials) {
            updates.partner_initials = partnerInfo.partner_initials;
          }
          if (status !== existing.status) updates.status = status;
          if (category !== existing.category) updates.category = category;

          if (Object.keys(updates).length > 0) {
            updates.id = existing.id;
            this.db.updateProject(updates);
            results.updated++;
          }
        } else {
          // Create new project
          this.db.createProject({
            client: client,
            name: projectName,
            status: status,
            category: category,
            notes: notes,
            partner_id: partnerInfo.partner_id,
            partner_ids: partnerInfo.partner_ids,
            partner_initials: partnerInfo.partner_initials
          });
          results.imported++;
        }
      }
    }

    return results;
  }

  /**
   * Detect which columns map to our fields from the header row.
   * Returns a map of field name -> 1-based column number.
   * Falls back to positional V4 convention: A=partner, B=active, C=client, D=project, E=notes.
   */
  _detectColumns(headerRow) {
    const map = { partner: null, active: null, client: null, project: null, notes: null };

    // Try header-based detection
    const colCount = headerRow.cellCount || 10; // scan up to 10 columns
    for (let col = 1; col <= colCount; col++) {
      const val = String(headerRow.getCell(col).value || '').toLowerCase().trim();
      if (!val) continue;
      if (val.includes('partner') && !map.partner)       map.partner = col;
      else if (val.includes('active') && !map.active)    map.active = col;
      else if (val.includes('client') && !map.client)    map.client = col;
      else if ((val.includes('project') || val.includes('name') || val.includes('description')) && !map.project)
                                                          map.project = col;
      else if (val.includes('note') && !map.notes)       map.notes = col;
    }

    // Fall back to positional V4 convention if key columns weren't found
    if (!map.client || !map.project) {
      map.partner = map.partner || 1;   // A
      map.active = map.active || 2;     // B
      map.client = map.client || 3;     // C
      map.project = map.project || 4;   // D
      map.notes = map.notes || 5;       // E
    } else if (!map.active) {
      // Headers found for client/project but not Active — try column B as fallback
      map.active = 2;
    }

    // Ensure partner column has a fallback
    if (!map.partner) map.partner = 1;

    return map;
  }

  /**
   * Check if a cell has a yellow fill (V4 convention for active status).
   * V4 checked for fill colors: FFFFFF00, 00FFFF00, FFFF00
   * exceljs stores ARGB as 8-char hex (e.g., "FFFFFF00") in fill.fgColor.argb
   */
  _hasYellowFill(cell) {
    const fill = cell.fill;
    if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return false;

    const candidates = [
      this._parseColor(fill.fgColor?.argb),
      this._parseColor(fill.bgColor?.argb),
    ].filter(Boolean);

    return candidates.some(color => this._isYellowColor(color));
  }

  _parseColor(argb) {
    let hex = String(argb || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!hex) return null;
    if (hex.length === 8) hex = hex.slice(2);
    if (hex.length !== 6) return null;

    return {
      hex,
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  _isYellowColor(color) {
    const knownYellows = new Set([
      'FFFF00', // bright yellow
      'FFF200', // rich yellow
      'FFFF99', // pale yellow
      'FFF2CC', // Excel light yellow
      'FFD966', // Excel accent yellow
      'FFEB9C', // Excel highlight yellow
      'FFFACD', // lemon chiffon
      'FFF59D', // soft yellow
      'FFF9C4', // pastel yellow
    ]);

    if (knownYellows.has(color.hex)) return true;

    const strongYellow = color.r >= 200 && color.g >= 180 && color.b <= 170;
    const paleYellow = color.r >= 235 && color.g >= 220 && color.b <= 215;
    const balancedRedGreen = Math.abs(color.r - color.g) <= 70;
    const clearlyNotBlue = color.r >= color.b + 35 && color.g >= color.b + 35;

    return balancedRedGreen && clearlyNotBlue && (strongYellow || paleYellow);
  }

  /**
   * Try to resolve partner string (e.g. "DM/NC", "JR") to one or more partner IDs.
   * Matches against initials, username, and full-name variants.
   */
  _resolvePartners(partnerStr) {
    if (!partnerStr) {
      return { partner_id: null, partner_ids: [], partner_initials: '' };
    }

    const users = this.db.getUsers();
    const partners = users.filter(u => u.role === 'partner');
    const rawTokens = partnerStr.split(/[\/,&]+/).map(s => s.trim()).filter(Boolean);
    const tokens = rawTokens.length > 0 ? rawTokens : [partnerStr.trim()];
    const resolved = [];
    const seen = new Set();

    for (const token of tokens) {
      const normalizedToken = token.replace(/\s+/g, '').toUpperCase();
      const partner = partners.find(candidate => {
        const initials = this._getPartnerInitials(candidate);
        const username = String(candidate.username || '').replace(/\s+/g, '').toUpperCase();
        const display = String(candidate.display_name || '').replace(/\s+/g, '').toUpperCase();
        const fullName = `${candidate.first_name || ''}${candidate.last_name || ''}`.replace(/\s+/g, '').toUpperCase();

        return normalizedToken === initials || normalizedToken === username || normalizedToken === display || normalizedToken === fullName;
      });

      if (partner && !seen.has(partner.id)) {
        seen.add(partner.id);
        resolved.push(partner);
      }
    }

    // If only one partner exists, default to them
    if (resolved.length === 0 && partners.length === 1) {
      resolved.push(partners[0]);
    }

    return {
      partner_id: resolved[0]?.id || null,
      partner_ids: resolved.map(partner => partner.id),
      partner_initials: resolved.length > 0
        ? resolved.map(partner => this._getPartnerInitials(partner)).join('/')
        : this._normalizePartnerInitials(partnerStr),
    };
  }

  _getPartnerInitials(partner) {
    const firstName = String(partner.first_name || '').trim();
    const lastName = String(partner.last_name || '').trim();

    if (firstName || lastName) {
      return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    }

    const nameParts = String(partner.display_name || '').trim().split(/\s+/).filter(Boolean);
    return nameParts.map(part => part[0]).join('').toUpperCase();
  }

  _normalizePartnerInitials(partnerStr) {
    return partnerStr
      .split(/[\/,&]+/)
      .map(part => part.trim().replace(/\s+/g, '').toUpperCase())
      .filter(Boolean)
      .join('/');
  }

  /**
   * Find an existing project by client + name (case-insensitive).
   */
  _findExistingProject(client, name) {
    const projects = this.db.getProjects();
    const clientLower = client.toLowerCase();
    const nameLower = name.toLowerCase();

    return projects.find(p =>
      p.client.toLowerCase() === clientLower &&
      p.name.toLowerCase() === nameLower
    );
  }
}

module.exports = ExcelImport;
