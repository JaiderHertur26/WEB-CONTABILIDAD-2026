import { toAccountingDateInput } from '@/lib/accountingDate';
import {
    canonicalizeFixedAssets,
    getAssetAcquisitionDate,
    getAssetRetirementDate,
    getAssetSnapshot,
    suggestDepreciationAccounts,
} from '@/lib/fixedAssetLifecycle';

export const PATRIMONIAL_ASSET_TYPES = {
    TANGIBLE: 'tangible',
    REAL_ESTATE: 'real_estate',
    INTANGIBLE: 'intangible',
};

const unique = values => [...new Set((values || []).filter(Boolean).map(String))];

export const inferPatrimonialAssetType = asset => {
    const explicit = String(asset?.assetType || asset?.patrimonialAssetType || '').trim();
    if (Object.values(PATRIMONIAL_ASSET_TYPES).includes(explicit)) return explicit;

    const code = String(asset?.accountCode || asset?.fixedAssetAccountCode || '');
    if (code.startsWith('16')) return PATRIMONIAL_ASSET_TYPES.INTANGIBLE;
    if (asset?.sourceEstateId || asset?.estateId || code.startsWith('1504') || code.startsWith('1516')) {
        return PATRIMONIAL_ASSET_TYPES.REAL_ESTATE;
    }
    return PATRIMONIAL_ASSET_TYPES.TANGIBLE;
};

const leafAccounts = (accounts, predicate) => {
    const candidates = (accounts || []).filter(predicate);
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

export const getTangibleAssetAccounts = accounts =>
    leafAccounts(accounts, account => {
        const code = String(account?.number || '');
        return code.startsWith('15') &&
            !code.startsWith('1504') &&
            !code.startsWith('1508') &&
            !code.startsWith('1516') &&
            !code.startsWith('1592');
    });

export const getRealEstateAccounts = accounts =>
    leafAccounts(accounts, account => {
        const code = String(account?.number || '');
        return code.startsWith('1504') || code.startsWith('1516');
    });

export const getIntangibleAssetAccounts = accounts =>
    leafAccounts(accounts, account => {
        const code = String(account?.number || '');
        return code.startsWith('16') &&
            !code.startsWith('169') &&
            !/AMORTIZACION|AMORTIZACIÓN/i.test(String(account?.name || ''));
    });
const findLeafByPrefixes = (accounts, prefixes) => {
    for (const prefix of prefixes) {
        const matches = leafAccounts(accounts, account => String(account?.number || '').startsWith(prefix));
        if (matches.length > 0) return matches[0];
    }
    return null;
};

export const suggestPatrimonialAccounts = (assetType, assetAccount, accounts) => {
    if (assetType === PATRIMONIAL_ASSET_TYPES.INTANGIBLE) {
        return {
            accumulated: findLeafByPrefixes(accounts, ['1698', '169']),
            expense: findLeafByPrefixes(accounts, ['5165', '5265']),
        };
    }
    return suggestDepreciationAccounts(assetAccount, accounts);
};

export const calculateAnnualAmortization = asset => {
    const cost = Math.max(0, Number(asset?.value || 0));
    const residual = Math.max(0, Math.min(cost, Number(asset?.residualValue || 0)));
    const life = Number(asset?.usefulLifeYears || 0);
    if (!life || life <= 0) return 0;
    return Math.max(0, (cost - residual) / life);
};

const amortizationFromTransactions = (asset, transactions) =>
    (transactions || []).flatMap(transaction => {
        const entries = Array.isArray(transaction?.intangibleAssetEntries)
            ? transaction.intangibleAssetEntries
            : [];
        return entries
            .filter(entry => String(entry?.assetId) === String(asset?.id))
            .map(entry => ({
                type: 'amortization',
                date: toAccountingDateInput(entry.date || transaction.date),
                amount: Number(entry.amount || 0),
                transactionId: transaction.id,
                voucherNumber: transaction.voucherNumber,
                year: entry.year || transaction.amortizationYear,
            }));
    });

export const buildIntangibleHistory = (asset, transactions = []) => {
    const acquisitionDate = getAssetAcquisitionDate(asset);
    const history = [{
        type: 'acquisition',
        date: acquisitionDate,
        amount: Number(asset?.value || 0),
        transactionId: asset?.transactionId || null,
        label: asset?.sourceType === 'income' ? 'Incorporación / ingreso' : 'Adquisición / alta',
    }];

    const saved = Array.isArray(asset?.amortizationHistory)
        ? asset.amortizationHistory.map(entry => ({
            ...entry,
            type: 'amortization',
            date: toAccountingDateInput(entry.date),
            amount: Number(entry.amount || 0),
        }))
        : [];
    const amortization = saved.length > 0 ? saved : amortizationFromTransactions(asset, transactions);

    if (amortization.length === 0 && Number(asset?.accumulatedAmortization || 0) > 0) {
        const accumulated = Number(asset.accumulatedAmortization || 0);
        const asOf = toAccountingDateInput(asset?.amortizationAsOf);
        const years = unique([...(asset?.amortizedYears || []), asset?.amortizedYear]).sort();

        if (asOf || years.length === 0) {
            history.push({
                type: 'amortization',
                date: asOf || acquisitionDate,
                amount: accumulated,
                label: 'Amortización histórica anterior',
                legacy: true,
            });
        } else {
            let remaining = accumulated;
            const annual = calculateAnnualAmortization(asset) || accumulated / years.length;
            years.forEach((year, index) => {
                if (remaining <= 0) return;
                const amount = index === years.length - 1 ? remaining : Math.min(remaining, annual);
                history.push({
                    type: 'amortization',
                    date: `${year}-12-31`,
                    amount,
                    year,
                    label: 'Amortización histórica reconstruida',
                    legacy: true,
                });
                remaining -= amount;
            });
        }
    } else {
        history.push(...amortization);
    }

    const retiredAt = getAssetRetirementDate(asset);
    if (retiredAt || asset?.status === 'Dado de Baja') {
        history.push({
            type: 'retirement',
            date: retiredAt || '',
            amount: 0,
            reason: asset?.retirementReason || '',
            transactionId: asset?.retireTransactionId || null,
            label: 'Baja del intangible',
        });
    }

    return history
        .filter(entry => entry.type === 'retirement' || entry.date)
        .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
};
export const getIntangibleSnapshot = (asset, cutoffDate, transactions = []) => {
    const cutoff = toAccountingDateInput(cutoffDate);
    const acquired = getAssetAcquisitionDate(asset);
    const retiredAt = getAssetRetirementDate(asset);
    const present = Boolean(cutoff && acquired && acquired <= cutoff) &&
        (!retiredAt || retiredAt > cutoff) &&
        !(asset?.status === 'Dado de Baja' && !retiredAt);

    const originalValue = Math.max(0, Number(asset?.value || 0));
    const accumulatedAmortization = Math.min(
        originalValue,
        buildIntangibleHistory(asset, transactions)
            .filter(entry => entry.type === 'amortization' && entry.date && entry.date <= cutoff)
            .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );

    return {
        asset,
        present,
        originalValue,
        accumulatedAmortization,
        netBookValue: present ? Math.max(0, originalValue - accumulatedAmortization) : 0,
    };
};

export const estateToMasterAsset = estate => ({
    id: estate?.masterAssetId || `estate-${estate?.id}`,
    sourceEstateId: estate?.id,
    assetType: PATRIMONIAL_ASSET_TYPES.REAL_ESTATE,
    acquisitionDate: toAccountingDateInput(estate?.acquisitionDate || estate?.date),
    date: toAccountingDateInput(estate?.acquisitionDate || estate?.date),
    name: estate?.name || 'Propiedad',
    value: Number(estate?.value || 0),
    quantity: 1,
    location: estate?.address || estate?.location || '',
    address: estate?.address || '',
    category: estate?.category || 'Propiedad / Inmueble',
    accountCode: estate?.accountCode || '',
    accountName: estate?.accountName || '',
    usefulLifeYears: Number(estate?.usefulLifeYears || (Number(estate?.depreciationRate || 0) > 0 ? 100 / Number(estate.depreciationRate) : 45)),
    residualValue: Number(estate?.residualValue || 0),
    depreciationMethod: estate?.depreciationMethod || 'linea_recta',
    accumulatedDepreciation: Number(estate?.accumulatedDepreciation || 0),
    depreciationHistory: Array.isArray(estate?.depreciationHistory) ? estate.depreciationHistory : undefined,
    depreciatedYears: Array.isArray(estate?.depreciatedYears) ? estate.depreciatedYears : [],
    accumulatedDepreciationAccountCode: estate?.accumulatedDepreciationAccountCode || '',
    accumulatedDepreciationAccountName: estate?.accumulatedDepreciationAccountName || '',
    depreciationExpenseAccountCode: estate?.depreciationExpenseAccountCode || '',
    depreciationExpenseAccountName: estate?.depreciationExpenseAccountName || '',
    transactionId: estate?.transactionId || null,
    status: estate?.status || 'Activo',
    retiredAt: estate?.retiredAt || null,
    retirementReason: estate?.retirementReason || '',
    retireTransactionId: estate?.retireTransactionId || null,
    contractManaged: Boolean(estate?.contractManaged),
    sourceContractNumber: estate?.sourceContractNumber || '',
    company_id: estate?.company_id,
    companyId: estate?.companyId,
    lifecycleVersion: 3,
});

export const buildPatrimonialRegistry = (assets = [], realEstates = []) => {
    const normalizedAssets = canonicalizeFixedAssets(assets).map(asset => ({
        ...asset,
        assetType: inferPatrimonialAssetType(asset),
        lifecycleVersion: Math.max(3, Number(asset?.lifecycleVersion || 0)),
    }));

    const byEstateId = new Map(
        normalizedAssets
            .filter(asset => asset?.sourceEstateId)
            .map(asset => [String(asset.sourceEstateId), asset])
    );

    const result = [...normalizedAssets];
    (realEstates || []).forEach(estate => {
        const existing = byEstateId.get(String(estate?.id)) ||
            result.find(asset => estate?.masterAssetId && String(asset.id) === String(estate.masterAssetId));
        const mapped = estateToMasterAsset(estate);

        if (existing) {
            const index = result.findIndex(asset => String(asset.id) === String(existing.id));
            result[index] = {
                ...existing,
                ...mapped,
                id: existing.id,
                accountCode: estate?.accountCode || existing.accountCode || '',
                accountName: estate?.accountName || existing.accountName || '',
                accumulatedDepreciationAccountCode: estate?.accumulatedDepreciationAccountCode || existing.accumulatedDepreciationAccountCode || '',
                accumulatedDepreciationAccountName: estate?.accumulatedDepreciationAccountName || existing.accumulatedDepreciationAccountName || '',
                depreciationExpenseAccountCode: estate?.depreciationExpenseAccountCode || existing.depreciationExpenseAccountCode || '',
                depreciationExpenseAccountName: estate?.depreciationExpenseAccountName || existing.depreciationExpenseAccountName || '',
            };
        } else {
            result.push(mapped);
        }
    });

    return canonicalizeFixedAssets(result).map(asset => ({
        ...asset,
        assetType: inferPatrimonialAssetType(asset),
        lifecycleVersion: Math.max(3, Number(asset?.lifecycleVersion || 0)),
    }));
};
export const summarizePatrimonialAtCutoff = (
    fixedAssets,
    realEstates,
    cutoffDate,
    transactions = []
) => {
    const registry = buildPatrimonialRegistry(fixedAssets, realEstates);

    const tangibleAssets = registry.filter(asset => inferPatrimonialAssetType(asset) === PATRIMONIAL_ASSET_TYPES.TANGIBLE);
    const realEstateAssets = registry.filter(asset => inferPatrimonialAssetType(asset) === PATRIMONIAL_ASSET_TYPES.REAL_ESTATE);
    const intangibleAssets = registry.filter(asset => inferPatrimonialAssetType(asset) === PATRIMONIAL_ASSET_TYPES.INTANGIBLE);

    const summarizeDepreciable = assets => {
        const snapshots = assets
            .map(asset => getAssetSnapshot(asset, cutoffDate, transactions))
            .filter(row => row.present);
        return {
            assets: snapshots,
            count: snapshots.length,
            grossCost: snapshots.reduce((sum, row) => sum + row.originalValue, 0),
            accumulatedDepreciation: snapshots.reduce((sum, row) => sum + row.accumulatedDepreciation, 0),
            netBookValue: snapshots.reduce((sum, row) => sum + row.netBookValue, 0),
        };
    };

    const intangibleSnapshots = intangibleAssets
        .map(asset => getIntangibleSnapshot(asset, cutoffDate, transactions))
        .filter(row => row.present);

    return {
        registry,
        tangible: summarizeDepreciable(tangibleAssets),
        realEstate: summarizeDepreciable(realEstateAssets),
        intangible: {
            assets: intangibleSnapshots,
            count: intangibleSnapshots.length,
            grossCost: intangibleSnapshots.reduce((sum, row) => sum + row.originalValue, 0),
            accumulatedAmortization: intangibleSnapshots.reduce((sum, row) => sum + row.accumulatedAmortization, 0),
            netBookValue: intangibleSnapshots.reduce((sum, row) => sum + row.netBookValue, 0),
        },
    };
};
