import { APIError, type Access, type CollectionConfig, type FieldAccess, type Where } from 'payload'
import {
  calculateScenario,
  type FinancialProfileValues,
  type ScenarioAssumptions,
} from '@/lib/flux-calculations'

const isAdminField: FieldAccess = ({ req }) => req.user?.collection === 'admins'
const isAdminRequest = (req: Parameters<Access>[0]['req']) => req.user?.collection === 'admins'

export const FluxScenarios: CollectionConfig = {
  slug: 'flux-scenarios',
  admin: {
    group: 'Flux',
    useAsTitle: 'name',
    defaultColumns: ['name', 'goal', 'createdAt'],
  },
  access: {
    create: ({ req }) =>
      isAdminRequest(req) ||
      req.user?.collection === 'users' ||
      req.context.allowFluxDemoAccess === true,
    delete: ({ req }) =>
      isAdminRequest(req) ||
      (req.user?.collection === 'users' ? ({ owner: { equals: req.user.id } } as Where) : false),
    read: ({ req }) => {
      if (isAdminRequest(req)) return true
      if (req.user?.collection === 'users') return { owner: { equals: req.user.id } } as Where
      return req.context.allowFluxDemoAccess === true
    },
    update: ({ req }) =>
      isAdminRequest(req) ||
      (req.user?.collection === 'users' ? ({ owner: { equals: req.user.id } } as Where) : false),
  },
  versions: false,
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        const merged = { ...(originalDoc ?? {}), ...(data ?? {}) }
        const assumptions = merged.assumptions as ScenarioAssumptions | undefined
        const profileValue = merged.profile
        const profileID =
          typeof profileValue === 'object' && profileValue !== null ? profileValue.id : profileValue

        if (!assumptions || !profileID) {
          throw new APIError('A profile and complete scenario assumptions are required.', 400)
        }
        if (assumptions.down > assumptions.price) {
          throw new APIError('Down payment cannot exceed the vehicle price.', 400)
        }

        const profile = await req.payload.findByID({
          collection: 'flux-profiles',
          id: profileID,
          overrideAccess: false,
          req,
        })

        const profileValues: FinancialProfileValues = {
          income: profile.income,
          housing: profile.housing,
          expenses: profile.expenses,
          savings: profile.savings,
          debt: profile.debt,
        }

        return {
          ...data,
          ...(req.user?.collection === 'users' ? { owner: req.user.id } : {}),
          result: calculateScenario(assumptions, profileValues),
        }
      },
    ],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { position: 'sidebar' },
      access: {
        create: isAdminField,
        update: isAdminField,
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 100,
    },
    {
      name: 'profile',
      type: 'relationship',
      relationTo: 'flux-profiles',
      required: true,
      index: true,
    },
    {
      name: 'goal',
      type: 'text',
      required: true,
      maxLength: 160,
    },
    {
      name: 'assumptions',
      type: 'group',
      fields: [
        { name: 'price', type: 'number', min: 1, required: true },
        { name: 'down', type: 'number', min: 0, required: true },
        {
          name: 'term',
          type: 'number',
          required: true,
          validate: (value: number | null | undefined) =>
            [36, 48, 60, 72].includes(Number(value)) || 'Term must be 36, 48, 60, or 72 months.',
        },
        { name: 'apr', type: 'number', min: 0, max: 40, required: true },
        { name: 'insurance', type: 'number', min: 0, required: true },
        { name: 'running', type: 'number', min: 0, required: true },
        { name: 'fees', type: 'number', min: 0, required: true },
        {
          name: 'purchaseTiming',
          type: 'select',
          defaultValue: 'now',
          required: true,
          options: [
            { label: 'Buy now', value: 'now' },
            { label: 'Wait 3 months', value: 'wait-3-months' },
          ],
        },
      ],
    },
    {
      name: 'result',
      type: 'group',
      admin: {
        readOnly: true,
      },
      fields: [
        { name: 'payment', type: 'number', required: true },
        { name: 'interest', type: 'number', required: true },
        { name: 'totalRepayment', type: 'number', required: true },
        { name: 'totalMonthly', type: 'number', required: true },
        { name: 'upfront', type: 'number', required: true },
        { name: 'cashFlowBefore', type: 'number', required: true },
        { name: 'remainingAfter', type: 'number', required: true },
        { name: 'savingsAfterUpfront', type: 'number', required: true },
      ],
    },
  ],
}
