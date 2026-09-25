import { toAccountingDateInput } from '@/lib/accountingDate';

const normalizeText = value => String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const unique = values => [...new Set((values || []).filter(Boolean).map(String))];

export const isFixedAssetAccount = account => {
    const code = String(account?.number || account?.code || '');
    return code.startsWith('15') &&
        !code.startsWith('1508') &&
        !code.startsWith('1592');
};

export const getFixedAssetAccounts = accounts => {
    const candidates = (accounts || []).filter(isFixedAssetAccount);
    return candidates
        .filter(account => {
            const code = String(account?.number || '');
            return !candidates.some(other => {
                const otherCode = String(other?.number || '');
                return otherCode !== code && otherCode.startsWith(code);
            });
        })
        .sort((a, b) => String(a.number || '').localeCompare(String(b.number || '')));
};

export const getAssetAcquisitionDate = asset =>
    toAccountingDateInput(asset?.acquisitionDate || asset?.date || asset?.createdAt) ||
    (asset?.year ? `${asset.year}-01-01` : '1900-01-01');

export const getAssetRetirementDate = asset =>
    toAccountingDateInput(asset?.retiredAt || asset?.retirementDate);
export const defaultUsefulLifeYears = code => {
    const value = String(code || '');
    if (value.startsWith('1504')) return 0;
    if (value.startsWith('1532')) return 0;
    if (value.startsWith('1516')) return 45;
    if (value.startsWith('1528')) return 5;
    if (value.startsWith('1540')) return 5;
    if (value.startsWith('1524')) return 10;
    return 10;
};

const findAccountByPrefix = (accounts, prefixes) => {
    for (const prefix of prefixes) {
        const matches = (accounts || [])
            .filter(account => String(account?.number || '').startsWith(prefix))
            .sort((a, b) => String(b.number || '').length - String(a.number || '').length);
        if (matches.length > 0) return matches[0];
    }
    return null;
};

export const suggestDepreciationAccounts = (assetAccount, accounts) => {
    const code = String(assetAccount?.number || assetAccount?.code || '');
    let accumulatedPrefixes = [];
    let expensePrefixes = [];

    if (code.startsWith('1516')) {
        accumulatedPrefixes = ['159216', '159205', '1592'];
        expensePrefixes = ['516010', '5160'];
    } else if (code.startsWith('1524')) {
        accumulatedPrefixes = ['159215', '1592'];
        expensePrefixes = ['516015', '5160'];
    } else if (code.startsWith('1528')) {
        accumulatedPrefixes = ['159220', '1592'];
        expensePrefixes = ['516020', '5160'];
    } else if (code.startsWith('1540')) {
        accumulatedPrefixes = ['159235', '1592'];
        expensePrefixes = ['516035', '5160'];
    }

    return {
        accumulated: findAccountByPrefix(accounts, accumulatedPrefixes) || null,
        expense: findAccountByPrefix(accounts, expensePrefixes) || null,
    };
};
const cloneSignature = asset => [
    String(asset?.assetType || asset?.patrimonialAssetType || ''),
    normalizeText(asset?.name),
    normalizeText(asset?.model),
    normalizeText(asset?.category),
    normalizeText(asset?.location),
    Number(asset?.value || 0).toFixed(2),
    Number(asset?.quantity || 1),
    String(asset?.company_id || asset?.companyId || ''),
].join('|');

const normalizeAsset = asset => {
    const acquisitionDate = getAssetAcquisitionDate(asset);
    return {
        ...asset,
        acquisitionDate,
        date: acquisitionDate || asset?.date || '',
        lifecycleVersion: 2,
        legacyYears: unique([...(asset?.legacyYears || []), asset?.year]),
    };
};

export const canonicalizeFixedAssets = assets => {
    const normalized = (assets || []).map(normalizeAsset);
    const groups = new Map();

    normalized.forEach(asset => {
        const key = cloneSignature(asset);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(asset);
    });

    const result = [];
    groups.forEach(group => {
        const originals = group.filter(asset => !String(asset.id || '').startsWith('cloned-'));
        const clones = group.filter(asset => String(asset.id || '').startsWith('cloned-'));
        if (clones.length === 0 || originals.length > 1) {
            result.push(...group);
            return;
        }

        const ordered = [...group].sort((a, b) =>
            getAssetAcquisitionDate(a).localeCompare(getAssetAcquisitionDate(b)) ||
            String(a.year || '').localeCompare(String(b.year || ''))
        );
        const canonical = originals[0] || ordered[0];
        const latest = [...ordered].sort((a, b) =>
            String(b.year || '').localeCompare(String(a.year || ''))
        )[0];

        result.push({
            ...canonical,
            acquisitionDate: getAssetAcquisitionDate(canonical) || getAssetAcquisitionDate(ordered[0]),
            accumulatedDepreciation: Math.max(...group.map(a => Number(a.accumulatedDepreciation || 0))),
            netBookValue: Number(latest.netBookValue ?? canonical.netBookValue ?? canonical.value ?? 0),
            status: latest.status || canonical.status,
            usage: latest.usage || canonical.usage,
            retiredAt: latest.retiredAt || canonical.retiredAt || ((latest.status === 'Dado de Baja' && latest.year) ? `${latest.year}-12-31` : null),
            retirementReason: latest.retirementReason || canonical.retirementReason || '',
            retireTransactionId: latest.retireTransactionId || canonical.retireTransactionId || null,
            retireTransactionIds: unique(group.flatMap(a => a.retireTransactionIds || [])),
            depreciatedYears: unique(group.flatMap(a => a.depreciatedYears || []).concat(group.map(a => a.depreciatedYear))),
            legacyYears: unique(group.flatMap(a => a.legacyYears || []).concat(group.map(a => a.year))),
            legacySourceIds: unique(group.map(a => a.id).filter(id => id !== canonical.id)),
            lifecycleVersion: 2,
        });
    });

    return result;
};
const depreciationEntriesFromTransactions = (asset, transactions) =>
    (transactions || []).flatMap(transaction => {
        const entries = Array.isArray(transaction?.fixedAssetEntries)
            ? transaction.fixedAssetEntries
            : [];
        return entries
            .filter(entry => String(entry?.assetId) === String(asset?.id))
            .map(entry => ({
                type: 'depreciation',
                date: toAccountingDateInput(entry.date || transaction.date),
                amount: Number(entry.amount || 0),
                transactionId: transaction.id,
                voucherNumber: transaction.voucherNumber,
                year: entry.year || transaction.depreciationYear,
            }));
    });

export const buildAssetHistory = (asset, transactions = []) => {
    const acquisitionDate = getAssetAcquisitionDate(asset);
    const history = [{
        type: 'acquisition',
        date: acquisitionDate,
        amount: Number(asset?.value || 0),
        transactionId: asset?.transactionId || null,
        label: asset?.sourceType === 'income' ? 'Incorporación / ingreso' : 'Adquisición / alta',
    }];

    const savedDepreciation = Array.isArray(asset?.depreciationHistory)
        ? asset.depreciationHistory.map(entry => ({
            ...entry,
            type: 'depreciation',
            date: toAccountingDateInput(entry.date),
            amount: Number(entry.amount || 0),
        }))
        : [];
    const depreciation = savedDepreciation.length > 0
        ? savedDepreciation
        : depreciationEntriesFromTransactions(asset, transactions);

    if (depreciation.length === 0 && Number(asset?.accumulatedDepreciation || 0) > 0) {
        const accumulated = Number(asset.accumulatedDepreciation || 0);
        const depreciationAsOf = toAccountingDateInput(asset?.depreciationAsOf);
        const years = unique([...(asset?.depreciatedYears || []), asset?.depreciatedYear]).sort();

        if (depreciationAsOf || years.length === 0) {
            history.push({
                type: 'depreciation',
                date: depreciationAsOf || acquisitionDate,
                amount: accumulated,
                label: 'Depreciación histórica anterior',
                legacy: true,
            });
        } else {
            let remaining = accumulated;
            const annualReference = calculateAnnualDepreciation(asset) || (accumulated / years.length);
            years.forEach((year, index) => {
                if (remaining <= 0) return;
                const amount = index === years.length - 1
                    ? remaining
                    : Math.min(remaining, annualReference);
                history.push({
                    type: 'depreciation',
                    date: `${year}-12-31`,
                    amount,
                    year,
                    label: 'Depreciación histórica reconstruida',
                    legacy: true,
                });
                remaining -= amount;
            });
        }
    } else {
        history.push(...depreciation);
    }

    const retiredAt = getAssetRetirementDate(asset);
    if (retiredAt || asset?.status === 'Dado de Baja') {
        history.push({
            type: 'retirement',
            date: retiredAt || '',
            amount: 0,
            reason: asset?.retirementReason || '',
            transactionId: asset?.retireTransactionId || null,
            label: 'Baja del activo',
        });
    }

    return history
        .filter(entry => entry.type === 'retirement' || entry.date)
        .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
};
export const isAssetPresentAt = (asset, cutoffDate) => {
    const cutoff = toAccountingDateInput(cutoffDate);
    const acquired = getAssetAcquisitionDate(asset);
    if (!cutoff || !acquired || acquired > cutoff) return false;

    const retiredAt = getAssetRetirementDate(asset);
    if (retiredAt) return retiredAt > cutoff;
    if (asset?.status === 'Dado de Baja') return false;
    return true;
};

export const getAssetAccumulatedDepreciationAt = (asset, cutoffDate, transactions = []) => {
    const cutoff = toAccountingDateInput(cutoffDate);
    if (!cutoff) return 0;

    return buildAssetHistory(asset, transactions)
        .filter(entry => entry.type === 'depreciation' && entry.date && entry.date <= cutoff)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
};

export const getAssetSnapshot = (asset, cutoffDate, transactions = []) => {
    const originalValue = Math.max(0, Number(asset?.value || 0));
    const present = isAssetPresentAt(asset, cutoffDate);
    const accumulated = Math.min(
        originalValue,
        Math.max(0, getAssetAccumulatedDepreciationAt(asset, cutoffDate, transactions))
    );

    return {
        asset,
        present,
        originalValue,
        accumulatedDepreciation: accumulated,
        netBookValue: present ? Math.max(0, originalValue - accumulated) : 0,
    };
};
export const summarizeFixedAssetsAtCutoff = (assets, cutoffDate, transactions = []) => {
    const canonical = canonicalizeFixedAssets(assets);
    const snapshots = canonical
        .map(asset => getAssetSnapshot(asset, cutoffDate, transactions))
        .filter(snapshot => snapshot.present);

    return {
        assets: snapshots,
        count: snapshots.length,
        grossCost: snapshots.reduce((sum, row) => sum + row.originalValue, 0),
        accumulatedDepreciation: snapshots.reduce((sum, row) => sum + row.accumulatedDepreciation, 0),
        netBookValue: snapshots.reduce((sum, row) => sum + row.netBookValue, 0),
    };
};

export const calculateAnnualDepreciation = asset => {
    const cost = Math.max(0, Number(asset?.value || 0));
    const residual = Math.max(0, Math.min(cost, Number(asset?.residualValue || 0)));
    const life = Number(asset?.usefulLifeYears || defaultUsefulLifeYears(asset?.accountCode));
    if (!life || life <= 0) return 0;
    return Math.max(0, (cost - residual) / life);
};
