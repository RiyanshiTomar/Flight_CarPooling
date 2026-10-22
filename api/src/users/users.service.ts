import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService, USER_COLS, normalizePhone } from '../auth/auth.service';
import { DbService } from '../db/db.service';
import { EventsService } from '../events/events.service';
import { GroupsService } from '../groups/groups.service';

export interface UpdateMeInput {
  name?: string;
  gender?: 'female' | 'male' | 'other';
  trustedContactName?: string;
  trustedContactPhone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly groups: GroupsService,
    private readonly events: EventsService,
    private readonly auth: AuthService,
  ) {}

  async get(userId: string) {
    const [row] = await this.db.query(`select ${USER_COLS} from users where id = $1 and deleted_at is null`, [userId]);
    if (!row) throw new NotFoundException('Account not found');
    return row;
  }

  async update(userId: string, dto: UpdateMeInput) {
    const me = await this.get(userId);
    let contactPhone: string | null | undefined = undefined;
    if (dto.trustedContactPhone !== undefined) {
      contactPhone = dto.trustedContactPhone === '' ? null : normalizePhone(dto.trustedContactPhone);
      if (contactPhone === me.phone) throw new BadRequestException('Your trusted contact must be someone else');
    }
    // gender is locked once you have an active women-only request, so nobody can slip into those groups
    if (dto.gender && dto.gender !== me.gender && me.gender) {
      const [active] = await this.db.query(
        `select 1 as x from ride_requests where user_id = $1 and women_only and status in ('PENDING','MATCHED','CONFIRMED','IN_TRIP')`,
        [userId],
      );
      if (active) throw new BadRequestException('Cancel your women-only ride before changing gender');
    }
    const [row] = await this.db.query(
      `update users set
         name = coalesce($2, name),
         gender = coalesce($3, gender),
         trusted_contact_name = case when $4::boolean then $5 else trusted_contact_name end,
         trusted_contact_phone = case when $6::boolean then $7 else trusted_contact_phone end
       where id = $1 returning ${USER_COLS}`,
      [
        userId,
        dto.name?.trim() ?? null,
        dto.gender ?? null,
        dto.trustedContactName !== undefined,
        dto.trustedContactName?.trim() || null,
        contactPhone !== undefined,
        contactPhone ?? null,
      ],
    );
    return row;
  }

  async stats(userId: string) {
    const [s] = await this.db.query(
      `select count(*)::int as completed,
              coalesce(sum(greatest(r.est_solo_fare - g.final_per_person, 0)), 0)::int as saved,
              coalesce(sum(g.seats_taken - m.seats), 0)::int as co_travellers
       from group_members m join groups g on g.id = m.group_id join ride_requests r on r.id = m.request_id
       where m.user_id = $1 and g.status = 'COMPLETED'`,
      [userId],
    );
    const [u] = await this.db.query('select rating_avg, rating_count, trips_count from users where id = $1', [userId]);
    return {
      tripsCompleted: s.completed,
      savedApprox: s.saved,
      coTravellers: s.co_travellers,
      rating: Number(u?.rating_avg ?? 5),
      ratingCount: u?.rating_count ?? 0,
    };
  }

  async deleteAccount(userId: string) {
    const touched = await this.db.tx(async (q) => {
      const active = await q.query<{ id: string }>(
        `select id from ride_requests where user_id = $1 and status in ('PENDING','MATCHED','CONFIRMED') for update`,
        [userId],
      );
      const groups: string[] = [];
      for (const r of active) {
        await q.query(`update ride_requests set status = 'CANCELLED' where id = $1`, [r.id]);
        const g = await this.groups.removeMember(q, r.id);
        if (g) {
          groups.push(g);
          await this.groups.systemMessage(q, g, 'A traveller left FlyPool and is no longer in this group.');
        }
      }
      await q.query('update share_links set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
      // keep the row (trips, ratings and safety reports still reference it) but erase everything personal
      await q.query(
        `update users set phone = 'deleted:' || id::text, name = null, gender = null,
                          trusted_contact_name = null, trusted_contact_phone = null, deleted_at = now()
         where id = $1`,
        [userId],
      );
      return groups;
    });
    await this.auth.logoutEverywhere(userId);
    for (const g of touched) await this.events.toGroup(g, { type: 'group.updated' });
    return { deleted: true };
  }
}
