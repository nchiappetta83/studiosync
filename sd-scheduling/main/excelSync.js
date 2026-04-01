const ExcelJS = require('exceljs');

class ExcelSync {
  constructor(db) {
    this.db = db;
  }

  async applyEvents(filePath, events = []) {
    const relevantEvents = events.filter((event) =>
      ['project-created', 'project-updated', 'project-deleted'].includes(event?.type)
    );

    if (!filePath || relevantEvents.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    for (const event of relevantEvents) {
      if (event.type === 'project-deleted') {
        this._removeProject(workbook, event.data || {});
      } else {
        this._upsertProject(workbook, event.data || {});
      }
    }

    await workbook.xlsx.writeFile(filePath);
  }

  _upsertProject(workbook, project) {
    const targetKind = project.category === 'future' ? 'future' : 'current';
    const targetSheet = this._getOrCreateSheet(workbook, targetKind);

    let match = this._findProjectRow(workbook, project);
    if (!match) {
      match = this._findPreviousProjectRow(workbook, project);
    }

    if (match) {
      match.sheet.spliceRows(match.rowNumber, 1);
    }

    const insertRowNumber = this._findInsertRow(targetSheet, project);
    targetSheet.spliceRows(insertRowNumber, 0, []);
    this._applyTemplateFromNeighbor(targetSheet, insertRowNumber);
    this._writeProjectRow(targetSheet, insertRowNumber, project);
  }

  _removeProject(workbook, project) {
    let match = this._findProjectRow(workbook, project);
    if (!match) {
      match = this._findPreviousProjectRow(workbook, project);
    }

    if (!match && project.id) {
      const existing = this.db.getProjectById(project.id);
      if (existing) {
        match = this._findProjectRow(workbook, existing);
      }
    }

    if (match) {
      match.sheet.spliceRows(match.rowNumber, 1);
    }
  }

  _writeProjectRow(sheet, rowNumber, project) {
    this._ensureHeaders(sheet);
    const colMap = this._detectColumns(sheet.getRow(1));
    const row = sheet.getRow(rowNumber);

    row.getCell(colMap.partner).value = this._getPartnerCellValue(project);
    row.getCell(colMap.active).value = '';
    row.getCell(colMap.client).value = project.client || '';
    row.getCell(colMap.project).value = project.name || '';
    row.getCell(colMap.notes).value = project.notes || '';

    this._clearCellFill(row.getCell(colMap.partner));
    this._clearCellFill(row.getCell(colMap.client));
    this._clearCellFill(row.getCell(colMap.project));
    this._clearCellFill(row.getCell(colMap.notes));
    this._applyActiveFill(row.getCell(colMap.active), project.status === 'active');

    row.commit();
  }

  _findProjectRow(workbook, project) {
    const client = String(project.client || '').trim().toLowerCase();
    const name = String(project.name || '').trim().toLowerCase();
    if (!client && !name) return null;

    for (const sheet of workbook.worksheets) {
      const colMap = this._detectColumns(sheet.getRow(1));
      const rowCount = sheet.rowCount || 0;

      for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);
        const rowClient = String(row.getCell(colMap.client).value || '').trim().toLowerCase();
        const rowName = String(row.getCell(colMap.project).value || '').trim().toLowerCase();

        if (rowClient === client && rowName === name) {
          return { sheet, rowNumber };
        }
      }
    }

    return null;
  }

  _findPreviousProjectRow(workbook, project) {
    const previousClient = project.previous_client || project._previous?.client || '';
    const previousName = project.previous_name || project._previous?.name || '';
    if (!previousClient && !previousName) return null;

    return this._findProjectRow(workbook, {
      client: previousClient,
      name: previousName,
    });
  }

  _findInsertRow(sheet, project) {
    const colMap = this._detectColumns(sheet.getRow(1));
    const rowCount = sheet.rowCount || 0;

    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const rowClient = String(row.getCell(colMap.client).value || '').trim();
      const rowProject = String(row.getCell(colMap.project).value || '').trim();

      if (!rowClient && !rowProject) {
        return rowNumber;
      }

      const compare = this._compareProjects(
        { client: project.client, name: project.name },
        { client: rowClient, name: rowProject }
      );

      if (compare < 0) {
        return rowNumber;
      }
    }

    return Math.max(rowCount + 1, 2);
  }

  _compareProjects(left, right) {
    const clientCompare = String(left.client || '').localeCompare(String(right.client || ''), undefined, { sensitivity: 'base' });
    if (clientCompare !== 0) return clientCompare;
    return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
  }

  _getOrCreateSheet(workbook, kind) {
    const targetName = kind === 'future' ? 'Future Projects' : 'Current Projects';
    const existing = workbook.worksheets.find((sheet) => {
      const name = sheet.name.toLowerCase();
      return kind === 'future' ? name.includes('future') : name.includes('current');
    });

    if (existing) {
      this._ensureHeaders(existing);
      return existing;
    }

    const sheet = workbook.addWorksheet(targetName);
    this._ensureHeaders(sheet);
    return sheet;
  }

  _ensureHeaders(sheet) {
    const header = sheet.getRow(1);
    if (!String(header.getCell(1).value || '').trim()) header.getCell(1).value = 'Partner';
    if (!String(header.getCell(2).value || '').trim()) header.getCell(2).value = 'Active';
    if (!String(header.getCell(3).value || '').trim()) header.getCell(3).value = 'Client';
    if (!String(header.getCell(4).value || '').trim()) header.getCell(4).value = 'Project';
    if (!String(header.getCell(5).value || '').trim()) header.getCell(5).value = 'Notes';
    header.commit();
  }

  _detectColumns(headerRow) {
    const map = { partner: 1, active: 2, client: 3, project: 4, notes: 5 };
    const colCount = Math.max(headerRow.cellCount || 5, 5);

    for (let col = 1; col <= colCount; col++) {
      const val = String(headerRow.getCell(col).value || '').toLowerCase().trim();
      if (!val) continue;
      if (val.includes('partner')) map.partner = col;
      else if (val.includes('active')) map.active = col;
      else if (val.includes('client')) map.client = col;
      else if (val.includes('project') || val.includes('name') || val.includes('description')) map.project = col;
      else if (val.includes('note')) map.notes = col;
    }

    return map;
  }

  _applyTemplateFromNeighbor(sheet, rowNumber) {
    const templateRow = (rowNumber + 1 <= (sheet.rowCount || 0))
      ? sheet.getRow(rowNumber + 1)
      : (rowNumber - 1 >= 2 ? sheet.getRow(rowNumber - 1) : null);

    if (!templateRow) return;

    const row = sheet.getRow(rowNumber);
    row.height = templateRow.height;

    for (let col = 1; col <= Math.max(sheet.columnCount || 5, 5); col++) {
      row.getCell(col).style = this._cloneStyle(templateRow.getCell(col).style);
    }
  }

  _cloneStyle(style) {
    if (!style) return {};
    return JSON.parse(JSON.stringify(style));
  }

  _applyActiveFill(cell, isActive) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isActive ? 'FFF2CC' : 'FFFFFFFF' },
      bgColor: { argb: isActive ? 'FFF2CC' : 'FFFFFFFF' },
    };
  }

  _clearCellFill(cell) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' },
      bgColor: { argb: 'FFFFFFFF' },
    };
  }

  _getPartnerCellValue(project) {
    if (project.partner_initials) return project.partner_initials;

    const ids = this._parsePartnerIds(project.partner_ids);
    if (ids.length > 0) {
      const labels = ids
        .map((id) => this.db.getUserById(id))
        .filter(Boolean)
        .map((user) => this._getUserInitials(user));
      if (labels.length > 0) return labels.join('/');
    }

    if (project.partner_id) {
      const user = this.db.getUserById(project.partner_id);
      if (user) return this._getUserInitials(user);
    }

    return '';
  }

  _parsePartnerIds(partnerIds) {
    if (Array.isArray(partnerIds)) return partnerIds.filter(Boolean);
    try {
      const parsed = JSON.parse(partnerIds || '[]');
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  _getUserInitials(user) {
    const firstName = String(user.first_name || '').trim();
    const lastName = String(user.last_name || '').trim();
    if (firstName || lastName) {
      return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    }

    return String(user.display_name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
}

module.exports = ExcelSync;
