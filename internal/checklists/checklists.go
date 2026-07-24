package checklists

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
	"strings"
)

type Item struct {
	ID         uuid.UUID  `json:"id"`
	TaskID     uuid.UUID  `json:"task_id"`
	Label      string     `json:"label"`
	Done       bool       `json:"is_done"`
	Order      int        `json:"order"`
	SOPID      *uuid.UUID `json:"sop_id,omitempty"`
	SOPVersion *int       `json:"sop_version,omitempty"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func (s *Service) List(ctx context.Context, taskID uuid.UUID) ([]Item, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,task_id,label,is_done,item_order,sop_id,sop_version FROM checklist_items WHERE tenant_id=$1 AND task_id=$2 ORDER BY item_order,id`, p.TenantID, taskID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.TaskID, &i.Label, &i.Done, &i.Order, &i.SOPID, &i.SOPVersion); e != nil {
			return nil, e
		}
		out = append(out, i)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, taskID uuid.UUID, label string) (Item, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Item{}, e
	}
	if strings.TrimSpace(label) == "" {
		return Item{}, fmt.Errorf("label required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Item{}, e
	}
	defer database.Rollback(tx)
	var i Item
	e = database.Row(tx, ctx, `INSERT INTO checklist_items(tenant_id,task_id,label,item_order) SELECT $1,$2,$3,COALESCE(max(item_order)+1,0) FROM checklist_items WHERE tenant_id=$1 AND task_id=$2 RETURNING id,task_id,label,is_done,item_order,sop_id,sop_version`, p.TenantID, taskID, label).Scan(&i.ID, &i.TaskID, &i.Label, &i.Done, &i.Order, &i.SOPID, &i.SOPVersion)
	if e != nil {
		return Item{}, e
	}
	e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "checklist_item", EntityID: i.ID, After: i})
	if e != nil {
		return Item{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Item{}, e
	}
	return i, nil
}
func (s *Service) Toggle(ctx context.Context, id uuid.UUID, done bool) (Item, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Item{}, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Item{}, e
	}
	defer database.Rollback(tx)
	var before, after Item
	e = database.Row(tx, ctx, `SELECT id,task_id,label,is_done,item_order,sop_id,sop_version FROM checklist_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, p.TenantID, id).Scan(&before.ID, &before.TaskID, &before.Label, &before.Done, &before.Order, &before.SOPID, &before.SOPVersion)
	if e != nil {
		return Item{}, e
	}
	e = database.Row(tx, ctx, `UPDATE checklist_items SET is_done=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,task_id,label,is_done,item_order,sop_id,sop_version`, p.TenantID, id, done).Scan(&after.ID, &after.TaskID, &after.Label, &after.Done, &after.Order, &after.SOPID, &after.SOPVersion)
	if e != nil {
		return Item{}, e
	}
	e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "update", EntityType: "checklist_item", EntityID: id, Before: before, After: after})
	if e != nil {
		return Item{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Item{}, e
	}
	return after, nil
}
